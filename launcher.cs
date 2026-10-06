using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace RodoslovnayaApp {
    static class Program {
        [STAThread]
        static void Main() {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string port = "3000";
            string url = "http://localhost:" + port;

            // 1. Проверяем наличие собранных файлов dist или запускаем dev
            string args = "/c npm run dev";
            if (Directory.Exists(Path.Combine(baseDir, "dist"))) {
                args = "/c npm run preview -- --port " + port;
            }

            // 2. Фоновый запуск локального веб-сервера без чёрного окна консоли
            ProcessStartInfo serverInfo = new ProcessStartInfo {
                FileName = "cmd.exe",
                Arguments = args,
                WorkingDirectory = baseDir,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                UseShellExecute = false
            };

            Process serverProc = null;
            try {
                serverProc = Process.Start(serverInfo);
            } catch (Exception ex) {
                MessageBox.Show("Не удалось запустить локальный сервер: " + ex.Message, "Ошибка запуска", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            // Небольшая пауза для инициализации сервера
            Thread.Sleep(1200);

            // 3. Запуск в режиме отдельного нативного окна Windows (Edge App Mode)
            string edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
            if (!File.Exists(edgePath)) {
                edgePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
            }

            Process appWindow = null;
            if (File.Exists(edgePath)) {
                ProcessStartInfo edgeInfo = new ProcessStartInfo {
                    FileName = edgePath,
                    Arguments = "--app=" + url + " --window-size=1280,850",
                    UseShellExecute = false
                };
                appWindow = Process.Start(edgeInfo);
            } else {
                Process.Start(url);
            }

            // Ожидание закрытия окна и автоматическое завершение сервера
            if (appWindow != null) {
                appWindow.WaitForExit();
                try {
                    if (serverProc != null && !serverProc.HasExited) {
                        serverProc.Kill();
                    }
                } catch { }
            }
        }
    }
}
