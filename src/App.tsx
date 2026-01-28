import { useState, useEffect, useRef } from "react";
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
import { AlertDialog } from "./components/views/AlertDialog";
import { useDeviceStatus } from "./hooks/useDeviceStatus";
import { useTerminal } from "./hooks/useTerminal";
import { useDebloater } from "./hooks/useDebloater";
import { useBackupOperations } from "./hooks/useBackupOperations";
import { ModuleType } from "./context/AppContext";
import { useApp } from "./context/AppContext";



function App() {
  const { isConnected, devices } = useDeviceStatus();
  const { settings, logs, addLog, clearLogs } = useApp();
  const [activeModule, setActiveModule] = useState<ModuleType>('backup');

  // Log Panel Local State (Open/Close)
  const [isLogOpen, setIsLogOpen] = useState(false);

  // Terminal Logic Hook
  const terminal = useTerminal(isConnected ? devices[0]?.id : undefined);

  // Debloater Logic Hook
  // Debloater Logic Hook (Uses Global Context for logging)
  const debloater = useDebloater(isConnected ? devices[0]?.id : undefined, 0);

  // Backup Operations Hook (P1 Refactoring - Tüm backup logic'i burada)
  const backup = useBackupOperations(
    isConnected ? devices[0]?.id : undefined,
    settings.backupPath || undefined,
    {
      soundEnabled: settings.soundEnabled,
      notificationsEnabled: settings.notificationsEnabled
    }
  );



  const prevConnectedRef = useRef(false);

  // Cihaz bağlantı durumu değişikliklerini logla
  useEffect(() => {
    if (isConnected && !prevConnectedRef.current) {
      const device = devices[0];
      addLog(`Device Connected: ${device.model} (${device.id})`, "success");
    } else if (!isConnected && prevConnectedRef.current) {
      addLog("Device Disconnected", "warning");
      backup.clearSelections();
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, devices, backup]);

  // Modül değiştiğinde seçimleri temizle
  useEffect(() => {
    backup.clearSelections();
  }, [activeModule]);



  /**
   * Global refresh - Debloater ve diğer modüller için.
   */
  const handleRefresh = () => {
    backup.refresh();
    debloater.refresh();
    addLog("Source synchronization active...", "info");
  };

  const renderModuleSidebar = () => {
    switch (activeModule) {
      case 'backup':
        return null;
      case 'restore':
        return (
          <RestoreModule
            selectedBackups={backup.selectedBackups}
            onToggleBackup={backup.toggleBackup}
            onRefresh={handleRefresh}
            refreshTrigger={backup.refreshTrigger} // P0 #2: Artık dinamik
            customPath={settings.backupPath || undefined} // P0 #1: Settings klasörü kullanılıyor
            onDeleteBackup={backup.deleteBackup}
          />
        );
      case 'terminal':
        return (
          <TerminalSidebar
            onExecute={terminal.executeCommand}
            isExecuting={terminal.isExecuting}
            disabled={!isConnected}
            toolsStatus={terminal.toolsStatus}
            onInstallTools={terminal.installTools}
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
          history={terminal.history}
          onExecute={terminal.executeCommand}
          isExecuting={terminal.isExecuting}
          disabled={!isConnected}
          onClear={terminal.clearHistory}
          sideloadProgress={terminal.sideloadProgress}
          commandHistory={terminal.commandHistory}
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
          // Data
          packages={backup.packages}
          backups={backup.backups}
          packagesLoading={backup.packagesLoading}
          backupsLoading={backup.backupsLoading}
          packagesError={backup.packagesError}
          backupsError={backup.backupsError}
          // Selections
          selectedPackages={backup.selectedPackages}
          selectedBackups={backup.selectedBackups}
          // Package Actions
          onTogglePackage={backup.togglePackage}
          onToggleSelectAll={backup.toggleSelectAllPackages}
          // Backup Actions
          onToggleBackup={backup.toggleBackup}
          onDeleteBackup={backup.deleteBackup}
          onToggleSelectAllBackups={backup.toggleSelectAllBackups}
          // Operations
          onRefresh={handleRefresh}
          onExecuteBackup={backup.executeBackup}
          onExecuteRestore={backup.executeRestore}
          onBatchDeleteBackups={backup.batchDeleteBackups}
          // State
          isProcessing={backup.isProcessing}
          totalSize={backup.totalSize}
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
            <LogPanel
              logs={logs}
              isOpen={isLogOpen}
              onToggle={() => setIsLogOpen(!isLogOpen)}
              onClear={clearLogs}
              progress={backup.progress}
            />
          </div>
        </div>
      </div>

      {/* GLOBAL BACKUP/RESTORE OVERLAY */}
      <BackupOverlay
        progress={backup.progress}
        onClose={() => backup.setProgress(p => ({ ...p, isActive: false }))}
      />

      {/* GLOBAL ERROR DIALOGS */}
      <AlertDialog
        isOpen={backup.errorState.isOpen}
        title={backup.errorState.title}
        message={backup.errorState.message}
        onClose={backup.dismissError}
      />
      <AlertDialog
        isOpen={debloater.errorState.isOpen}
        title={debloater.errorState.title}
        message={debloater.errorState.message}
        onClose={debloater.dismissError}
      />
      {/* DEBLOATER CONFIRMATION */}
      <AlertDialog
        isOpen={debloater.confirmState.isOpen}
        title={debloater.confirmState.title}
        message={debloater.confirmState.message}
        variant={debloater.confirmState.variant}
        onClose={debloater.dismissConfirm}
        onConfirm={debloater.confirmState.onConfirm}
      />
    </div>
  );
}

export default App;
