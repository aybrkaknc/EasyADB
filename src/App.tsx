import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogPanel } from "./components/LogPanel";
import { TitleBar } from "./components/TitleBar";
import { IconRail } from "./components/layout/IconRail";
import { ModuleContainer } from "./components/layout/ModuleContainer";
import { BackupModule } from "./components/modules/BackupModule";
import { RestoreModule } from "./components/modules/RestoreModule";
import { TerminalSidebar, TerminalView } from "./components/modules/TerminalModule";
import { DebloaterView } from './components/modules/DebloaterModule';
import { PerformanceView } from "./components/modules/PerformanceModule";
import { AppReadyView, AppDisconnectedView } from "./components/views/ConnectionViews";
import { SettingsView } from "./components/views/SettingsView";
import { BackupOverlay } from "./components/views/BackupOverlay";
import { useDeviceStatus } from "./hooks/useDeviceStatus";
import { useTerminal } from "./hooks/useTerminal";
import { useDebloater } from "./hooks/useDebloater";
import { ModuleType } from "./context/AppContext";
import { PackageInfo, BackupFile, ProgressState } from "./types/adb";
import { playSuccessSound, sendOSNotification } from "./lib/feedback";
import { useApp } from "./context/AppContext";

interface LogEntry {
  id: number;
  message: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: string;
}

function App() {
  const { isConnected, devices } = useDeviceStatus();
  const { settings } = useApp();
  const [globalRefreshTrigger, setGlobalRefreshTrigger] = useState(0);
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
  const debloater = useDebloater(isConnected ? devices[0]?.id : undefined, globalRefreshTrigger);

  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, message: "System initialized...", type: "info", timestamp: new Date().toLocaleTimeString() }
  ]);
  const [isLogOpen, setIsLogOpen] = useState(false);


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
    setGlobalRefreshTrigger(prev => prev + 1);
    addLog("Source synchronization active...", "info");
  };

  const handleTogglePackage = async (pkg: PackageInfo) => {
    const exists = selectedPackages.find(p => p.name === pkg.name);
    if (exists) {
      setSelectedPackages(prev => prev.filter(p => p.name !== pkg.name));
      setTotalSize(prev => Math.max(0, prev - (sizeCache[pkg.name] || 0)));
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

  const handleToggleSelectAll = async (pkgs: PackageInfo[]) => {
    const allFilteredSelected = pkgs.every(p => selectedPackages.some(sp => sp.name === p.name));
    const filteredNames = pkgs.map(p => p.name);

    if (allFilteredSelected) {
      // DESELECT: Remove these from current selection
      setSelectedPackages(prev => prev.filter(p => !filteredNames.includes(p.name)));
      const sizeToRemove = pkgs.reduce((acc, p) => acc + (sizeCache[p.name] || 0), 0);
      setTotalSize(prev => Math.max(0, prev - sizeToRemove));
    } else {
      // SELECT: Add missing ones
      const toAdd = pkgs.filter(p => !selectedPackages.some(sp => sp.name === p.name));
      if (toAdd.length > 0) {
        setSelectedPackages(prev => [...prev, ...toAdd]);

        let batchSize = 0;
        const newSizes: Record<string, number> = {};

        // Calculate size for already cached items immediately
        toAdd.forEach(p => {
          if (sizeCache[p.name]) {
            batchSize += sizeCache[p.name];
          }
        });

        // Optimistic update for cached items
        setTotalSize(prev => prev + batchSize);

        // Fetch sizes for uncached items
        if (isConnected && devices[0]?.id) {
          for (const pkg of toAdd) {
            if (!sizeCache[pkg.name]) {
              try {
                const size = await invoke<number>("get_package_size", {
                  deviceId: devices[0].id,
                  package: pkg
                });
                newSizes[pkg.name] = size;
                // Update total incrementally for better UX
                setTotalSize(prev => prev + size);
              } catch {
                // Silent fail
              }
            }
          }
          // Update cache once at the end
          if (Object.keys(newSizes).length > 0) {
            setSizeCache(prev => ({ ...prev, ...newSizes }));
          }
        }
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

  const handleToggleSelectAllBackups = (files: BackupFile[]) => {
    const allFilteredSelected = files.every(f => selectedBackups.some(sb => sb.path === f.path));
    if (allFilteredSelected) {
      const filePaths = files.map(f => f.path);
      setSelectedBackups(prev => prev.filter(f => !filePaths.includes(f.path)));
    } else {
      const toAdd = files.filter(f => !selectedBackups.some(sb => sb.path === f.path));
      setSelectedBackups(prev => [...prev, ...toAdd]);
    }
  };

  const handleBatchBackup = async () => {
    if (!isConnected || selectedPackages.length === 0) return;
    setIsProcessing(true);
    addLog(`Starting batch backup for ${selectedPackages.length} packages...`, "info");

    const total = selectedPackages.length;
    setProgress({ isActive: true, currentTask: "Preparing backup...", total, current: 0, completedItems: [] });

    for (let i = 0; i < total; i++) {
      const pkg = selectedPackages[i];
      setProgress(prev => ({
        ...prev,
        currentTask: pkg.name, // Just the name for cleaner HUD
        detail: `Stream synchronized. Transferring data packets for ${pkg.name}...`,
        current: i + 1,
      }));

      addLog(`>> Backing up: ${pkg.name}...`, "info");
      try {
        await invoke<string>("perform_backup", {
          deviceId: devices[0].id,
          package: pkg,
          customPath: settings.backupPath || null
        });
        setProgress(prev => ({
          ...prev,
          completedItems: [...(prev.completedItems || []), pkg.name]
        }));
        addLog(`[SUCCESS] Backup complete: ${pkg.name}`, "success");
      } catch (error) {
        addLog(`[FAILURE] ${pkg.name}: ${error}`, "error");
      }
    }

    setProgress(prev => ({ ...prev, currentTask: "Sequence Complete", detail: "All data packets verified and stored." }));

    addLog("BATCH BACKUP COMPLETE.", "success");
    setIsProcessing(false);
    setSelectedPackages([]);
    setTotalSize(0);
    setGlobalRefreshTrigger(prev => prev + 1);

    // Feedback
    if (settings.soundEnabled) playSuccessSound();
    if (settings.notificationsEnabled) {
      sendOSNotification("EasyADB: Backup Complete", `Successfully processed ${selectedPackages.length} packages.`);
    }
  };

  const handleBatchRestore = async () => {
    if (!isConnected || selectedBackups.length === 0) return;
    setIsProcessing(true);
    addLog(`Starting batch restore for ${selectedBackups.length} files...`, "info");

    const total = selectedBackups.length;
    setProgress({ isActive: true, currentTask: "Preparing restore...", total, current: 0, completedItems: [] });

    for (let i = 0; i < total; i++) {
      const file = selectedBackups[i];
      setProgress(prev => ({
        ...prev,
        currentTask: file.name,
        detail: `Injecting data payload: ${file.name}`,
        current: i + 1,
      }));

      addLog(`>> Restoring payload: ${file.name}...`, "info");
      try {
        await invoke<string>("perform_restore", {
          deviceId: devices[0].id,
          backupPath: file.path
        });
        setProgress(prev => ({
          ...prev,
          completedItems: [...(prev.completedItems || []), file.name]
        }));
        addLog(`[SUCCESS] Restore complete: ${file.name}`, "success");
      } catch (error) {
        addLog(`[FAILURE] ${file.name}: ${error}`, "error");
      }
    }

    setProgress(prev => ({ ...prev, currentTask: "Sequence Complete" }));

    addLog("Batch restore complete.", "success");
    setIsProcessing(false);
    setSelectedBackups([]);
    setGlobalRefreshTrigger(prev => prev + 1);

    // Feedback
    if (settings.soundEnabled) playSuccessSound();
    if (settings.notificationsEnabled) {
      sendOSNotification("EasyADB: Restore Complete", `Successfully restored ${selectedBackups.length} files.`);
    }
  };

  const handleDeleteBackup = async (backup: BackupFile) => {
    try {
      await invoke("delete_backup", { path: backup.path });
      addLog(`Backup deleted: ${backup.name}`, "success");
      setSelectedBackups(prev => prev.filter(b => b.path !== backup.path));
      setGlobalRefreshTrigger(prev => prev + 1);
    } catch (error) {
      addLog(`Failed to delete backup: ${error}`, "error");
    }
  };

  const handleBatchDeleteBackups = async (files: BackupFile[]) => {
    if (files.length === 0) return;
    setIsProcessing(true);
    addLog(`Deleting ${files.length} backups...`, "warning");

    for (const file of files) {
      try {
        await invoke("delete_backup", { path: file.path });
        addLog(`>> Deleted: ${file.name}`, "info");
      } catch (error) {
        addLog(`[ERROR] Failed to delete ${file.name}: ${error}`, "error");
      }
    }

    setSelectedBackups([]);
    setGlobalRefreshTrigger(prev => prev + 1);
    addLog("Bulk delete complete.", "success");
    setIsProcessing(false);
  };

  const renderModuleSidebar = () => {
    switch (activeModule) {
      case 'backup':
        return null;
      case 'restore':
        return (
          <RestoreModule
            selectedBackups={selectedBackups}
            onToggleBackup={handleToggleBackup}
            onRefresh={handleRefresh}
            refreshTrigger={globalRefreshTrigger}
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
        return null;
      case 'performance':
        return null;
      case 'settings':
        return null;
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
          error={debloater.error}
          onDisable={debloater.disableSelected}
          onEnable={debloater.enableSelected}
          onUninstall={debloater.uninstallSelected}
          onReinstall={debloater.reinstallSelected}
          onRefresh={debloater.refresh}
          filter={debloater.filter}
          onFilterChange={debloater.setFilter}
          search={debloater.search}
          onSearchChange={debloater.setSearch}
          totalCount={debloater.allPackagesCount}
        />
      );
    }

    if (activeModule === 'performance') {
      return <PerformanceView deviceId={isConnected ? devices[0]?.id : undefined} />;
    }

    if (activeModule === 'settings') {
      return <SettingsView />;
    }

    if (!isConnected) {
      return <AppDisconnectedView />;
    }



    if (activeModule === 'backup') {
      return (
        <BackupModule
          deviceId={devices[0]?.id}
          selectedPackages={selectedPackages}
          onTogglePackage={handleTogglePackage}
          onToggleSelectAll={handleToggleSelectAll}
          onRefresh={handleRefresh}
          refreshTrigger={globalRefreshTrigger}
          selectedBackups={selectedBackups}
          onToggleBackup={handleToggleBackup}
          onDeleteBackup={handleDeleteBackup}
          customBackupPath={settings.backupPath || undefined}
          onExecuteBackup={handleBatchBackup}
          onExecuteRestore={handleBatchRestore}
          onBatchDeleteBackups={handleBatchDeleteBackups}
          onToggleSelectAllBackups={handleToggleSelectAllBackups}
          isProcessing={isProcessing}
          totalSize={totalSize}
        />
      );
    }

    if (activeModule === 'restore') {
      // Automatically redirect to backup with restore filter
      setActiveModule('backup');
      return null;
    }

    return <AppReadyView device={devices[0]} />;
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden font-sans selection:bg-terminal-green/20 selection:text-terminal-green">
      <TitleBar className="z-[100]" deviceConnected={isConnected} isRooted={isConnected ? !!devices[0]?.is_rooted : false} />

      <div className="flex flex-1 overflow-hidden relative z-10">
        <IconRail
          activeModule={activeModule}
          onModuleChange={setActiveModule}
        />

        <div className="flex-1 flex overflow-hidden bg-black relative">
          {/* Sidebar Area (Conditional) */}
          {activeModule !== 'debloater' && activeModule !== 'backup' && activeModule !== 'terminal' && activeModule !== 'performance' && activeModule !== 'settings' && (
            <div className="w-64 border-r border-terminal-green/10 bg-black/40 hidden md:block shrink-0">
              <ModuleContainer activeModule={activeModule}>
                {renderModuleSidebar()}
              </ModuleContainer>
            </div>
          )}

          {/* Main Workspace (Content + Log) */}
          <div className="flex-1 flex flex-col relative overflow-hidden bg-zinc-950/30">
            {/* Grid Background Effect */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,65,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,65,0.1)_1px,transparent_1px)] bg-[size:30px_30px]" />
            </div>

            <div className="flex-1 overflow-hidden relative z-10">
              <ModuleContainer activeModule={activeModule}>
                {renderMainView()}
              </ModuleContainer>
            </div>

            {/* Global Log Panel (Integrated - Under Main View Only) */}
            {(activeModule === 'backup' || activeModule === 'debloater') && (
              <LogPanel
                logs={logs}
                isOpen={isLogOpen}
                onToggle={() => setIsLogOpen(!isLogOpen)}
                onClear={() => setLogs([])}
                progress={progress}
              />
            )}
          </div>
        </div>
      </div>

      {/* GLOBAL BACKUP/RESTORE OVERLAY */}
      <BackupOverlay
        progress={progress}
        onClose={() => setProgress(p => ({ ...p, isActive: false }))}
      />
    </div>
  );
}

export default App;

