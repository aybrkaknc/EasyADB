import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogPanel } from "./components/LogPanel";
import { TitleBar } from "./components/TitleBar";
import { IconRail } from "./components/layout/IconRail";
import { ModuleContainer } from "./components/layout/ModuleContainer";
import { BackupModule } from "./components/modules/BackupModule";
import { RestoreModule } from "./components/modules/RestoreModule";
import { SettingsModule } from "./components/modules/SettingsModule";
import { TerminalSidebar, TerminalView } from "./components/modules/TerminalModule";
import { DebloaterSidebar, DebloaterView } from "./components/modules/DebloaterModule";
import { PerformanceSidebar, PerformanceView } from "./components/modules/PerformanceModule";
import { AppReadyView, AppDisconnectedView } from "./components/views/ConnectionViews";
import { BackupConfirmationView } from "./components/views/BackupConfirmationView";
import { RestoreConfirmationView } from "./components/views/RestoreConfirmationView";
import { SettingsView } from "./components/views/SettingsView";
import { useDeviceStatus } from "./hooks/useDeviceStatus";
import { useTerminal } from "./hooks/useTerminal";
import { useDebloater } from "./hooks/useDebloater";
import { ModuleType } from "./context/AppContext";
import { PackageInfo, BackupFile, ProgressState } from "./types/adb";

interface LogEntry {
  id: number;
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: string;
}

function App() {
  const { isConnected, devices } = useDeviceStatus();
  const [activeModule, setActiveModule] = useState<ModuleType>('backup');
  const [progress, setProgress] = useState<ProgressState>({
    isActive: false,
    currentTask: "",
    current: 0,
    total: 0
  });

  // Terminal Logic Hook
  const { history, isExecuting, executeCommand, clearHistory, toolsStatus, installTools, sideloadProgress } = useTerminal(isConnected ? devices[0]?.id : undefined);

  // Debloater Logic Hook
  const debloater = useDebloater(isConnected ? devices[0]?.id : undefined);

  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, message: "System initialized...", type: "info", timestamp: new Date().toLocaleTimeString() }
  ]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'paths' | 'general' | 'about'>('paths');
  const backupPath = "C:\\Users\\Ayberk.DESKTOP-PL3VNE8\\Downloads\\EasyADB";

  const [refreshBackupsTrigger, setRefreshBackupsTrigger] = useState(0);
  const [refreshAppsTrigger, setRefreshAppsTrigger] = useState(0);

  const [selectedPackages, setSelectedPackages] = useState<PackageInfo[]>([]);
  const [selectedBackups, setSelectedBackups] = useState<BackupFile[]>([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [totalSize, setTotalSize] = useState<number>(0);
  const [sizeCache, setSizeCache] = useState<Record<string, number>>({});

  const prevConnectedRef = useRef(false);

  useEffect(() => {
    if (isConnected && !prevConnectedRef.current) {
      const device = devices[0];
      addLog(`Device Connected: ${device.model} (${device.id})`, "success");
    } else if (!isConnected && prevConnectedRef.current) {
      addLog("Device Disconnected", "warning");
      setSelectedPackages([]);
      setSelectedBackups([]);
      setTotalSize(0);
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, devices]);

  useEffect(() => {
    setSelectedPackages([]);
    setSelectedBackups([]);
    setTotalSize(0);
  }, [activeModule]);

  const addLog = (message: string, type: LogEntry['type'] = "info") => {
    setLogs(prev => [
      ...prev,
      { id: Date.now(), message, type, timestamp: new Date().toLocaleTimeString() }
    ]);
  };

  const handleRefresh = () => {
    if (activeModule === 'restore') {
      setRefreshBackupsTrigger(prev => prev + 1);
      addLog("Refreshing Local Backups...", "info");
    } else if (activeModule === 'backup') {
      setRefreshAppsTrigger(prev => prev + 1);
      addLog("Refreshing App List...", "info");
    }
  };

  const handleTogglePackage = async (pkg: PackageInfo) => {
    const exists = selectedPackages.find(p => p.name === pkg.name);
    if (exists) {
      setSelectedPackages(prev => prev.filter(p => p.name !== pkg.name));
      setTotalSize(prev => prev - (sizeCache[pkg.name] || 0));
    } else {
      setSelectedPackages(prev => [...prev, pkg]);
      if (!sizeCache[pkg.name] && isConnected) {
        try {
          const size = await invoke<number>("get_package_size", {
            deviceId: devices[0].id,
            package: pkg
          });
          setSizeCache(prev => ({ ...prev, [pkg.name]: size }));
          setTotalSize(prev => prev + size);
        } catch {
          // Silent fail
        }
      } else {
        setTotalSize(prev => prev + (sizeCache[pkg.name] || 0));
      }
    }
  };

  const handleToggleBackup = (backup: BackupFile) => {
    const exists = selectedBackups.find(b => b.path === backup.path);
    if (exists) {
      setSelectedBackups(prev => prev.filter(b => b.path !== backup.path));
    } else {
      setSelectedBackups(prev => [...prev, backup]);
    }
  };

  const handleBatchBackup = async () => {
    if (!isConnected || selectedPackages.length === 0) return;
    setIsProcessing(true);
    addLog(`Starting BATCH BACKUP for ${selectedPackages.length} packages...`, "info");

    const total = selectedPackages.length;
    setProgress({ isActive: true, currentTask: "Initializing Backup...", total, current: 0 });

    for (let i = 0; i < total; i++) {
      const pkg = selectedPackages[i];
      setProgress({
        isActive: true,
        currentTask: `Backing up: ${pkg.name}`,
        total,
        current: i + 1,
      });

      addLog(`>> Backing up: ${pkg.name}...`, "info");
      try {
        const result = await invoke<string>("perform_backup", {
          deviceId: devices[0].id,
          package: pkg
        });
        addLog(`[SUCCESS] ${result}`, "success");
      } catch (error) {
        addLog(`[FAILURE] ${pkg.name}: ${error}`, "error");
      }
    }

    setProgress(prev => ({ ...prev, currentTask: "Backup Complete" }));
    setTimeout(() => setProgress(p => ({ ...p, isActive: false })), 4000);

    addLog("BATCH BACKUP COMPLETE.", "success");
    setIsProcessing(false);
    setRefreshBackupsTrigger(prev => prev + 1);
  };

  const handleBatchRestore = async () => {
    if (!isConnected || selectedBackups.length === 0) return;
    setIsProcessing(true);
    addLog(`Starting BATCH RESTORE for ${selectedBackups.length} files...`, "info");

    const total = selectedBackups.length;
    setProgress({ isActive: true, currentTask: "Initializing Restore...", total, current: 0 });

    for (let i = 0; i < total; i++) {
      const file = selectedBackups[i];
      setProgress({
        isActive: true,
        currentTask: `Restoring: ${file.name}`,
        total,
        current: i + 1,
      });

      addLog(`>> Restoring payload: ${file.name}...`, "info");
      try {
        const result = await invoke<string>("perform_restore", {
          deviceId: devices[0].id,
          backupPath: file.path
        });
        addLog(`[SUCCESS] ${result}`, "success");
      } catch (error) {
        addLog(`[FAILURE] ${file.name}: ${error}`, "error");
      }
    }

    setProgress(prev => ({ ...prev, currentTask: "Restore Complete" }));
    setTimeout(() => setProgress(p => ({ ...p, isActive: false })), 4000);

    addLog("BATCH RESTORE COMPLETE.", "success");
    setIsProcessing(false);
  };

  const handleDeleteBackup = async (backup: BackupFile) => {
    try {
      await invoke("delete_backup", { path: backup.path });
      addLog(`Backup deleted: ${backup.name}`, "success");
      setSelectedBackups(prev => prev.filter(b => b.path !== backup.path));
      setRefreshBackupsTrigger(prev => prev + 1);
    } catch (error) {
      addLog(`Failed to delete backup: ${error}`, "error");
    }
  };

  const renderModuleSidebar = () => {
    switch (activeModule) {
      case 'backup':
        return (
          <BackupModule
            deviceId={isConnected ? devices[0]?.id : undefined}
            selectedPackages={selectedPackages}
            onTogglePackage={handleTogglePackage}
            onRefresh={handleRefresh}
            refreshTrigger={refreshAppsTrigger}
          />
        );
      case 'restore':
        return (
          <RestoreModule
            selectedBackups={selectedBackups}
            onToggleBackup={handleToggleBackup}
            onRefresh={handleRefresh}
            refreshTrigger={refreshBackupsTrigger}
            onDeleteBackup={handleDeleteBackup}
          />
        );
      case 'terminal':
        return (
          <TerminalSidebar
            onExecute={executeCommand}
            isExecuting={isExecuting}
            disabled={!isConnected}
            toolsStatus={toolsStatus}
            onInstallTools={installTools}
          />
        );
      case 'debloater':
        return (
          <DebloaterSidebar
            filter={debloater.filter}
            onFilterChange={debloater.setFilter}
            search={debloater.search}
            onSearchChange={debloater.setSearch}
            onRefresh={debloater.refresh}
            isLoading={debloater.isLoading}
            totalCount={debloater.allPackagesCount}
            filteredCount={debloater.packages.length}
            disabled={!isConnected}
          />
        );
      case 'performance':
        return <PerformanceSidebar />;
      case 'settings':
        return (
          <SettingsModule
            activeTab={settingsTab}
            onTabChange={setSettingsTab}
          />
        );
      default:
        return null;
    }
  };

  const renderMainView = () => {
    if (activeModule === 'terminal') {
      return (
        <TerminalView
          history={history}
          onExecute={executeCommand}
          isExecuting={isExecuting}
          disabled={!isConnected}
          onClear={clearHistory}
          sideloadProgress={sideloadProgress}
        />
      );
    }

    if (activeModule === 'debloater') {
      return (
        <DebloaterView
          packages={debloater.packages}
          selectedPackages={debloater.selectedPackages}
          onTogglePackage={debloater.togglePackage}
          onToggleSelectAll={debloater.toggleSelectAll}
          isLoading={debloater.isLoading}
          isProcessing={debloater.isProcessing}
          disabled={!isConnected}
          showSystemWarning={debloater.showSystemWarning}
          onDismissWarning={debloater.dismissSystemWarning}
          error={debloater.error}
          onDisable={debloater.disableSelected}
          onEnable={debloater.enableSelected}
          onUninstall={debloater.uninstallSelected}
          onReinstall={debloater.reinstallSelected}
          filter={debloater.filter}
        />
      );
    }

    if (activeModule === 'performance') {
      return <PerformanceView deviceId={isConnected ? devices[0]?.id : undefined} />;
    }

    if (activeModule === 'settings') {
      return <SettingsView backupPath={backupPath} />;
    }

    if (!isConnected) {
      return <AppDisconnectedView />;
    }

    if (activeModule === 'backup' && selectedPackages.length > 0) {
      return (
        <BackupConfirmationView
          selectedPackages={selectedPackages}
          totalSize={totalSize}
          isProcessing={isProcessing}
          onExecute={handleBatchBackup}
        />
      );
    }

    if (activeModule === 'restore' && selectedBackups.length > 0) {
      return (
        <RestoreConfirmationView
          selectedBackups={selectedBackups}
          isProcessing={isProcessing}
          onExecute={handleBatchRestore}
        />
      );
    }

    return <AppReadyView device={devices[0]} />;
  };

  return (
    <div className="flex flex-col h-screen w-full bg-background relative overflow-hidden">
      <TitleBar className="z-[100]" deviceConnected={isConnected} isRooted={isConnected ? !!devices[0]?.is_rooted : false} />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,2px_100%] animate-scanline opacity-10" />
      <div className="flex flex-1 overflow-hidden z-10 relative bg-black">
        <IconRail activeModule={activeModule} onModuleChange={setActiveModule} />
        <div className="w-80 shrink-0 h-full border-r border-terminal-green/20">
          <ModuleContainer activeModule={activeModule}>{renderModuleSidebar()}</ModuleContainer>
        </div>
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
          <main className="flex-1 overflow-hidden flex items-center justify-center relative w-full h-full min-w-0">
            {renderMainView()}
          </main>
          <LogPanel logs={logs} isOpen={isLogOpen} onToggle={() => setIsLogOpen(!isLogOpen)} progress={progress} />
        </div>
      </div>
    </div>
  );
}

export default App;
