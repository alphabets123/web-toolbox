using System;
using System.IO;
using System.Net;
using System.Diagnostics;
using Microsoft.Win32;
using System.Collections.Generic;

namespace SnapTaskStarter
{
    public class AppInfo
    {
        public string SourceFile;
        public string Url;
        public bool IsNodeApp;
        public AppInfo(string file, string url, bool isNode = true) { SourceFile = file; Url = url; IsNodeApp = isNode; }
    }

    class Program
    {
        const string PROTOCOL = "snaptask";
        const string BASE_DIR = @"C:\SnapTask";
        const string RUNTIME_DIR = @"C:\SnapTask\runtime";
        const string APPS_DIR = @"C:\SnapTask\apps";
        
        static Dictionary<string, AppInfo> AppMap = new Dictionary<string, AppInfo>();
        static AppInfo NodeRuntime = new AppInfo("node.exe", "https://nodejs.org/dist/v18.16.0/win-x64/node.exe", false);

        static void InitializeApps()
        {
            // 실제 배포를 위해 GitHub 메인 브랜치의 주소를 사용합니다.
            AppMap.Add("youtube", new AppInfo("youtube.js", "https://raw.githubusercontent.com/alphabets123/web-toolbox/main/projects/yt-agent/youtube.js"));
        }

        static void Main(string[] args)
        {
            InitializeApps();

            try {
                ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; // Tls12
            } catch { }

            Console.WriteLine("==========================================");
            Console.WriteLine("   Snap-Task V2 전용 플랫폼 런처");
            Console.WriteLine("==========================================\n");

            // [추가] 중복 실행 방지 체크
            if (IsAgentRunning())
            {
                Console.WriteLine("[INFO] 에이전트가 이미 가동 중입니다. 웹페이지를 이용해 주세요.");
                System.Threading.Thread.Sleep(1500);
                return;
            }

            if (!Directory.Exists(BASE_DIR)) Directory.CreateDirectory(BASE_DIR);
            if (!Directory.Exists(RUNTIME_DIR)) Directory.CreateDirectory(RUNTIME_DIR);
            if (!Directory.Exists(APPS_DIR)) Directory.CreateDirectory(APPS_DIR);

            // [추가] 자기 복제 및 상주 경로 등록 로직
            string currentExe = Process.GetCurrentProcess().MainModule.FileName;
            string permanentPath = Path.Combine(BASE_DIR, "st-starter.exe");

            if (currentExe.ToLower() != permanentPath.ToLower())
            {
                Console.WriteLine("[!] 시스템에 상주 설치를 진행합니다...");
                try {
                    File.Copy(currentExe, permanentPath, true);
                    Console.WriteLine("[OK] 'C:\\SnapTask' 폴더에 복사되었습니다.");
                    RegisterProtocol(permanentPath); // 고정된 경로로 등록
                } catch (Exception ex) {
                    Console.WriteLine("[Warn] 상주 설치 실패 (권한 문제일 수 있음): " + ex.Message);
                    RegisterProtocol(currentExe); // 실패 시 현재 경로라도 등록
                }
            }
            else
            {
                RegisterProtocol(currentExe); // 이미 상주 경로인 경우
            }

            string targetApp = "youtube";
            if (args.Length > 0)
            {
                string rawUrl = args[0];
                if (rawUrl.StartsWith(PROTOCOL + "://"))
                {
                    if (rawUrl.Contains("app=")) {
                        string query = rawUrl.Substring(rawUrl.IndexOf("app=") + 4);
                        targetApp = query.Split('&')[0];
                    }
                }
            }

            if (!AppMap.ContainsKey(targetApp))
            {
                Console.WriteLine("[Error] 알 수 없는 앱 요청: " + targetApp);
                WaitAndExit(3);
                return;
            }

            // 1. Node.js 공통 엔진 체크 및 다운로드
            string nodePath = Path.Combine(RUNTIME_DIR, NodeRuntime.SourceFile);
            if (!File.Exists(nodePath))
            {
                Console.WriteLine("[!] Node.js 공통 엔진이 없습니다. 다운로드 중 (약 30MB)...");
                if (!DownloadFile(NodeRuntime.Url, nodePath)) return;
            }

            // 2. 해당 앱 스크립트 체크 및 다운로드
            AppInfo info = AppMap[targetApp];
            string appPath = Path.Combine(APPS_DIR, info.SourceFile);

            Console.WriteLine(string.Format("[!] '{0}' 코드를 업데이트 중...", targetApp));
            if (!DownloadFile(info.Url, appPath)) return;

            // 3. 실행 (백그라운드 비가시 모드)
            Console.WriteLine(string.Format("[INFO] {0} 가동 중 (백그라운드)...", targetApp));
            try {
                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = nodePath;
                startInfo.Arguments = "\"" + appPath + "\"";
                startInfo.WorkingDirectory = BASE_DIR;
                
                // 디버깅을 위해 일시적으로 창을 띄웁니다.
                startInfo.CreateNoWindow = false; 
                startInfo.UseShellExecute = true;
                startInfo.WindowStyle = ProcessWindowStyle.Normal;

                Process.Start(startInfo);
                Console.WriteLine("[OK] 성공적으로 가동되었습니다. 웹페이지를 확인하세요.");
            } catch (Exception ex) {
                Console.WriteLine("[Error] 가동 실패: " + ex.Message);
                WaitAndExit(5);
                return;
            }

            System.Threading.Thread.Sleep(1500);
        }

        static bool DownloadFile(string url, string dest)
        {
            try {
                using (WebClient client = new WebClient()) {
                    client.DownloadFile(url, dest);
                }
                return true;
            } catch (Exception ex) {
                Console.WriteLine("[Error] 다운로드 실패: " + ex.Message);
                WaitAndExit(5);
                return false;
            }
        }

        static bool IsAgentRunning()
        {
            try {
                var request = (HttpWebRequest)WebRequest.Create("http://localhost:8888/status");
                request.Timeout = 1000;
                using (var response = (HttpWebResponse)request.GetResponse()) {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            } catch {
                return false;
            }
        }

        static void RegisterProtocol(string exePath)
        {
            try {
                using (RegistryKey classesKey = Registry.CurrentUser.OpenSubKey(@"Software\Classes", true))
                {
                    using (RegistryKey key = classesKey.CreateSubKey(PROTOCOL))
                    {
                        key.SetValue("", "URL:SnapTask Protocol");
                        key.SetValue("URL Protocol", "");
                        using (RegistryKey shell = key.CreateSubKey(@"shell\open\command"))
                        {
                            shell.SetValue("", "\"" + exePath + "\" \"%1\"");
                        }
                    }
                }
                Console.WriteLine("[OK] 시스템 가동 프로토콜 등록 완료.");
            } catch { }
        }

        static void WaitAndExit(int seconds)
        {
            Console.WriteLine(string.Format("\n{0}초 후 종료됩니다...", seconds));
            System.Threading.Thread.Sleep(seconds * 1000);
            Environment.Exit(1);
        }
    }
}
