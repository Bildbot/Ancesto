import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Share2, PlusSquare, X } from 'lucide-react';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed in standalone mode, hide
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`flex items-center gap-1.5 font-medium transition-all ${
          compact
            ? 'px-2.5 py-1.5 text-xs rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-700'
            : 'px-3 py-1.5 text-xs rounded-lg bg-stone-900 text-stone-100 hover:bg-stone-800 shadow-sm'
        }`}
        title="Установить как приложение на устройство"
      >
        <Download className="w-3.5 h-3.5 text-amber-500" />
        <span className="whitespace-nowrap">Установить</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-stone-200/80 hover:bg-stone-300 text-stone-700 transition"
          title="Как установить на iPhone или iPad"
        >
          <Share2 className="w-3.5 h-3.5 text-stone-600" />
          <span className="whitespace-nowrap">На экран</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-stone-900 relative border border-stone-200">
              <button
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 p-1"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mb-4 text-amber-800">
                <Share2 className="w-6 h-6" />
              </div>

              <h3 className="text-lg font-serif font-bold text-stone-900">
                Установка на iPhone / iPad
              </h3>
              <p className="mt-1 text-xs text-stone-500">
                Приложение будет открываться на весь экран без рамок браузера и работать автономно.
              </p>

              <div className="mt-4 space-y-3 text-sm text-stone-700">
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center">1</span>
                  <span>Нажмите кнопку <strong>«Поделиться»</strong> <Share2 className="w-4 h-4 inline mx-0.5 text-blue-600" /> в нижней панели Safari</span>
                </div>
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center">2</span>
                  <span>Прокрутите вниз и выберите <strong>«На экран "Домой"»</strong> <PlusSquare className="w-4 h-4 inline mx-0.5 text-stone-700" /></span>
                </div>
                <div className="flex items-start gap-3 p-2.5 rounded-lg bg-stone-50 border border-stone-100">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center">3</span>
                  <span>Нажмите <strong>«Добавить»</strong> в правом верхнем углу</span>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-stone-900 py-2.5 text-sm font-medium text-white hover:bg-stone-800 transition"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
