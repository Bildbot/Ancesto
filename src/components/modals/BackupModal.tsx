import React, { useRef, useState } from 'react';
import { FamilyTreeData } from '../../types/genealogy';
import { exportTreeAsJson, exportTreeAsGedcom, importTreeFromGedcom, validateImportedData, saveFamilyTree, waitForPendingSaves } from '../../services/db';
import { isTauriDesktop, exportNativeBackup, inspectNativeBackup, restoreNativeBackup, type BackupSummary } from '../../services/nativeTreeRepository';
import { open, save } from '@tauri-apps/plugin-dialog';
import { X, Download, Upload, RefreshCw, Trash2, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';

const MAX_BACKUP_FILE_SIZE = 100 * 1024 * 1024;

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  treeData: FamilyTreeData;
  onImportData: (data: FamilyTreeData) => Promise<void>;
  onResetToDemo: () => void;
  onClearTree: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  treeData,
  onImportData,
  onResetToDemo,
  onClearTree
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmAction, setConfirmAction] = useState<'resetDemo' | 'clearTree' | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [pendingImport, setPendingImport] = useState<FamilyTreeData | null>(null);
  const [pendingZip, setPendingZip] = useState<{ source: string; summary: BackupSummary } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const desktop = isTauriDesktop();

  const showError = (error: unknown) => {
    setStatusMessage({ text: error instanceof Error ? error.message : String(error), type: 'error' });
  };

  const handleExport = async () => {
    if (!desktop) { exportTreeAsJson(treeData); return; }
    setIsBusy(true);
    try {
      const destination = await save({
        defaultPath: `ancesto-${new Date().toISOString().slice(0, 10)}.zip`,
        filters: [{ name: 'Резервная копия Ancesto', extensions: ['zip'] }],
      });
      if (!destination) return;
      await saveFamilyTree(treeData);
      await exportNativeBackup(destination);
      setStatusMessage({ text: `ZIP-копия сохранена: ${destination}`, type: 'success' });
    } catch (error) { showError(error); }
    finally { setIsBusy(false); }
  };

  const handleRestoreZip = async () => {
    if (!pendingZip) return;
    setIsBusy(true);
    try {
      await waitForPendingSaves();
      const rollbackPath = await restoreNativeBackup(pendingZip.source);
      setPendingZip(null);
      setStatusMessage({ text: `Архив восстановлен. Предыдущая копия: ${rollbackPath}`, type: 'success' });
      window.location.reload();
    } catch (error) { showError(error); }
    finally { setIsBusy(false); }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setPendingImport(null);
    setPendingZip(null);
    setStatusMessage(null);
    if (!file) return;
    if (file.size > MAX_BACKUP_FILE_SIZE) {
      setStatusMessage({ text: `Размер файла ${ (file.size / (1024 * 1024)).toFixed(1) } МБ превышает допустимые 100 МБ.`, type: 'error' });
      return;
    }

    if (desktop && file.name.toLowerCase().endsWith('.zip')) {
      setStatusMessage({ text: 'ZIP-копии открываются через системный диалог ниже.', type: 'error' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const fileContent = event.target?.result as string;
        const isGedcom = /\.ged(?:com)?$/i.test(file.name);
        const valid = isGedcom
          ? importTreeFromGedcom(fileContent, file.name)
          : validateImportedData(JSON.parse(fileContent));
        if (valid) {
          setPendingImport(valid);
          setStatusMessage(null);
        } else {
          setStatusMessage({ text: isGedcom ? 'Не удалось найти персоналии в GEDCOM-файле. Проверьте формат файла.' : 'Ошибка: файл не является корректным архивом родословной.', type: 'error' });
        }
      } catch (err) {
        setStatusMessage({ text: /\.ged(?:com)?$/i.test(file.name) ? 'Не удалось прочитать GEDCOM-файл.' : 'Не удалось прочитать файл. Убедитесь, что это корректный JSON.', type: 'error' });
      }
    };
    reader.onerror = () => {
      setStatusMessage({ text: 'Не удалось прочитать файл. Попробуйте выбрать резервную копию ещё раз.', type: 'error' });
    };
    reader.readAsText(file);
  };

  const handleSelectNativeBackup = async () => {
    setIsBusy(true);
    setPendingImport(null);
    setPendingZip(null);
    setStatusMessage(null);
    try {
      const source = await open({ multiple: false, filters: [{ name: 'Резервная копия Ancesto', extensions: ['zip'] }] });
      if (typeof source !== 'string') return;
      const summary = await inspectNativeBackup(source);
      setPendingZip({ source, summary });
    } catch (error) { showError(error); }
    finally { setIsBusy(false); }
  };

  const totalMediaCount = treeData.persons.reduce(
    (acc, p) => acc + (p.mediaFiles?.length || 0),
    0
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in">
      <div 
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden"
        role="dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-stone-900 text-stone-100 border-b border-stone-800">
          <div>
            <h2 className="text-base font-serif font-bold text-stone-100">
              Управление архивом и Экспорт
            </h2>
            <p className="text-xs text-stone-400">
              Сохранение данных, перенос на другие устройства и стандарты
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="p-1.5 text-stone-400 hover:text-stone-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <fieldset disabled={isBusy} className="p-6 space-y-6 text-stone-800">
          {isBusy && <p role="status" className="text-xs text-stone-600">Проверка и обработка резервной копии…</p>}
          {/* Summary */}
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 block mb-2">
              Статистика текущего древа
            </span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-white border border-stone-200/80">
                <span className="text-lg font-bold font-mono text-stone-900">{treeData.persons.length}</span>
                <p className="text-[11px] text-stone-500">Персоналий</p>
              </div>
              <div className="p-2 rounded-lg bg-white border border-stone-200/80">
                <span className="text-lg font-bold font-mono text-stone-900">{treeData.relationships.length}</span>
                <p className="text-[11px] text-stone-500">Связей</p>
              </div>
              <div className="p-2 rounded-lg bg-white border border-stone-200/80">
                <span className="text-lg font-bold font-mono text-stone-900">{totalMediaCount}</span>
                <p className="text-[11px] text-stone-500">Медиафайлов</p>
              </div>
            </div>
          </div>

          {/* Export Options */}
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-700 block">
              Экспорт и Резервная копия
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleExport}
                className="flex items-start gap-3 p-3.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-amber-400 text-left transition shadow-2xs"
              >
                <div className="p-2 rounded-lg bg-amber-50 text-amber-700">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900">Полный архив ({desktop ? '.ZIP' : '.JSON'})</h4>
                  <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                    Включает все фото, сканы документов, даты и связи.
                  </p>
                </div>
              </button>

              <button
                onClick={() => exportTreeAsGedcom(treeData)}
                className="flex items-start gap-3 p-3.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-amber-400 text-left transition shadow-2xs"
              >
                <div className="p-2 rounded-lg bg-stone-100 text-stone-700">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-stone-900">Формат GEDCOM (.GED)</h4>
                  <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                    GEDCOM 5.5.1 сохраняет людей и семьи. Медиа, биографии переносятся частично; нестандартные связи могут не поддерживаться другими программами.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Import Option */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-700 block">
              Импорт и восстановление из файла
            </span>

            <input
              type="file"
              ref={fileInputRef}
              accept=".json,.ged,.gedcom"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed border-stone-300 hover:border-stone-500 bg-white text-xs font-medium text-stone-700 transition"
            >
              <Upload className="w-4 h-4 text-stone-500" />
              <span>Загрузить GEDCOM или JSON-копию с устройства</span>
            </button>

            {desktop && (
              <button
                onClick={() => void handleSelectNativeBackup()}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed border-stone-300 hover:border-stone-500 bg-white text-xs font-medium text-stone-700 transition"
              >
                <Upload className="w-4 h-4 text-stone-500" />
                <span>Проверить ZIP-копию через системный диалог</span>
              </button>
            )}

            {pendingZip && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-stone-800 space-y-2.5">
                <h4 className="text-xs font-bold text-amber-950">Заменить текущий архив проверенной ZIP-копией?</h4>
                <p className="text-xs text-amber-800">
                  {pendingZip.summary.persons} персон, {pendingZip.summary.relationships} связей, {pendingZip.summary.media} медиафайлов.
                  Перед заменой будет сохранена резервная копия текущего архива.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setPendingZip(null)} className="px-3 py-1.5 text-xs rounded-lg bg-white border border-stone-300">Отмена</button>
                  <button type="button" onClick={handleRestoreZip} className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 text-white">Восстановить архив</button>
                </div>
              </div>
            )}

            {pendingImport && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-stone-800 space-y-2.5">
                <div>
                  <h4 className="text-xs font-bold text-amber-950">Заменить текущий архив проверенной копией?</h4>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Будет импортировано: {pendingImport.persons.length} персон, {pendingImport.relationships.length} связей и {pendingImport.mediaArchive?.length || 0} файлов. Медиа из GEDCOM не включаются в стандартный формат.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingImport(null)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-stone-300 text-stone-700 hover:bg-stone-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsBusy(true);
                      setStatusMessage(null);
                      try {
                        await onImportData(pendingImport);
                        setPendingImport(null);
                        setStatusMessage({ text: 'Семейный архив успешно загружен!', type: 'success' });
                        setTimeout(onClose, 1200);
                      } catch (error) {
                        showError(error);
                      } finally {
                        setIsBusy(false);
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    Заменить архив
                  </button>
                </div>
              </div>
            )}
          </div>

          {statusMessage && (
            <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Reset / Clear with reliable in-modal confirmation */}
          <div className="pt-4 border-t border-stone-200 space-y-3">
            {confirmAction === 'resetDemo' && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-stone-800 space-y-2.5 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-950">Восстановить демонстрационное древо?</h4>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Будет загружена семья Морозовых и Соколовых (10 персоналий, связи, архивные метрики и вехи).
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-stone-300 text-stone-700 hover:bg-stone-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onResetToDemo();
                      setConfirmAction(null);
                      onClose();
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                  >
                    Да, восстановить демо-древо
                  </button>
                </div>
              </div>
            )}

            {confirmAction === 'clearTree' && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-stone-800 space-y-2.5 animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-red-950">Очистить древо и начать с чистого листа?</h4>
                    <p className="text-xs text-red-800 mt-0.5">
                      Все текущие персоналии, родственные связи и прикрепленные файлы будут безвозвратно удалены.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-stone-300 text-stone-700 hover:bg-stone-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClearTree();
                      setConfirmAction(null);
                      onClose();
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-xs"
                  >
                    Да, очистить всё
                  </button>
                </div>
              </div>
            )}

            {!confirmAction && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setConfirmAction('resetDemo')}
                  className="flex items-center gap-1.5 text-stone-600 hover:text-stone-900 font-medium px-2 py-1.5 rounded-lg hover:bg-stone-100 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                  <span>Восстановить демо-древо</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmAction('clearTree')}
                  className="flex items-center gap-1.5 text-red-600 hover:text-red-700 font-medium px-2 py-1.5 rounded-lg hover:bg-red-50 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Очистить и начать с нуля</span>
                </button>
              </div>
            )}
          </div>
        </fieldset>
      </div>
    </div>
  );
};
