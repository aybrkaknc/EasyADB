import { useState, useEffect } from "react";
import { FolderOpen, Github, Cpu, Bell, Volume2, X, Check, RefreshCw, Settings, HardDrive } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { cn } from "../../lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { open as openUrl } from "@tauri-apps/plugin-shell";

const APP_VERSION = "2.0.1";
const GITHUB_URL = "https://github.com/aybrkaknc/EasyADB";
const AUTHOR_URL = "https://github.com/aybrkaknc";

/**
 * SettingsView: Birleşik Ayarlar Sayfası
 * Header'da About bilgisi, altta genişletilebilir ayar kartları.
 */
export function SettingsView() {
    const { settings, updateSettings } = useApp();
    const [showPathModal, setShowPathModal] = useState(false);
    const [inputPath, setInputPath] = useState("");
    const [defaultPath, setDefaultPath] = useState<string>("Loading...");

    // Default path'i backend'den al
    useEffect(() => {
        invoke<string>("get_default_backup_path")
            .then(path => setDefaultPath(path))
            .catch(() => setDefaultPath("C:\\Users\\Downloads"));
    }, []);

    const displayPath = settings.backupPath || defaultPath;

    const handleOpenModal = () => {
        setInputPath(settings.backupPath || defaultPath);
        setShowPathModal(true);
    };

    const handleSavePath = () => {
        if (inputPath.trim()) {
            updateSettings({ backupPath: inputPath.trim() });
        }
        setShowPathModal(false);
    };

    const handleResetToDefault = () => {
        updateSettings({ backupPath: null });
        setShowPathModal(false);
    };

    const openFolderDialog = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: "Select Backup Folder",
                defaultPath: inputPath || defaultPath,
            });
            if (selected && typeof selected === 'string') {
                setInputPath(selected);
            }
        } catch (e) {
            console.error("Folder dialog failed:", e);
        }
    };

    return (
        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            {/* ══════════════════════════════════════════════════════════════ */}
            {/* HEADER: Title Left, About Right */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <div className="flex items-start justify-between mb-8 border-b border-terminal-green/20 pb-6 -mx-6 px-6">
                {/* Left: Title & Subtitle */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 mb-2">
                        <Settings className="w-6 h-6 text-terminal-green" />
                        <h1 className="text-2xl font-space font-black text-white tracking-[0.2em] drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">SETTINGS</h1>
                    </div>
                    <div className="text-[10px] text-white/80 font-mono tracking-widest uppercase">
                        APPLICATION PREFERENCES AND STORAGE CONFIGURATION
                    </div>
                </div>

                {/* Right: About Card (Compact) */}
                <div className="flex items-center gap-4 bg-black/40 border border-terminal-green/20 px-4 py-3"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))' }}
                >
                    <div className="text-2xl">⚡</div>
                    <div className="flex flex-col">
                        <button
                            onClick={() => openUrl(GITHUB_URL)}
                            className="text-left hover:text-terminal-green transition-colors"
                            title="Visit Repository"
                        >
                            <span className="text-sm font-space font-black tracking-widest">EasyADB</span>
                        </button>
                        <div className="flex items-center gap-2">
                            <Cpu className="w-2.5 h-2.5 text-terminal-green/60" />
                            <span className="text-[9px] font-mono text-terminal-green/60 tracking-widest">v{APP_VERSION}</span>
                        </div>
                    </div>
                    <div className="h-8 w-px bg-terminal-green/20 mx-2" />
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openUrl(AUTHOR_URL)}
                            className="p-2 border border-terminal-green/20 hover:border-terminal-green/50 hover:bg-terminal-green/5 transition-all"
                            title="Desgined by Ayberk"
                        >
                            <Github className="w-4 h-4 text-terminal-green/60 hover:text-terminal-green" />
                        </button>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SETTINGS GRID - Expandable Layout */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

                {/* ─────────────────────────────────────────────────────────── */}
                {/* CARD 1: FEEDBACK SYSTEM */}
                {/* ─────────────────────────────────────────────────────────── */}
                <div
                    className="relative border border-terminal-green/20 bg-black/40 overflow-hidden"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))' }}
                >
                    <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-terminal-green/40" />
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-terminal-green/40" />

                    <div className="px-5 py-4 border-b border-terminal-green/10">
                        <div className="flex items-center gap-2">
                            <Bell className="w-4 h-4 text-terminal-green/60" />
                            <span className="text-[11px] font-space font-bold text-white tracking-[0.2em]">FEEDBACK_SYSTEM</span>
                        </div>
                    </div>

                    <div className="p-5 space-y-4">
                        {/* Notifications Toggle */}
                        <div
                            className="flex items-center justify-between p-4 border border-terminal-green/10 hover:border-terminal-green/30 transition-colors cursor-pointer bg-black/30"
                            onClick={() => updateSettings({ notificationsEnabled: !settings.notificationsEnabled })}
                        >
                            <div className="flex items-center gap-3">
                                <Bell className={cn(
                                    "w-5 h-5 transition-colors",
                                    settings.notificationsEnabled ? "text-terminal-green" : "text-zinc-600"
                                )} />
                                <div>
                                    <div className="text-sm font-space text-white">OS Notifications</div>
                                    <div className="text-[9px] text-zinc-500 font-mono">System alerts on completion</div>
                                </div>
                            </div>
                            <div className={cn(
                                "w-11 h-6 rounded-full relative transition-colors",
                                settings.notificationsEnabled ? "bg-terminal-green/30" : "bg-zinc-800"
                            )}>
                                <div className={cn(
                                    "absolute top-1 w-4 h-4 rounded-full transition-all",
                                    settings.notificationsEnabled
                                        ? "left-6 bg-terminal-green"
                                        : "left-1 bg-zinc-600"
                                )} />
                            </div>
                        </div>

                        {/* Sound Toggle */}
                        <div
                            className="flex items-center justify-between p-4 border border-terminal-green/10 hover:border-terminal-green/30 transition-colors cursor-pointer bg-black/30"
                            onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}
                        >
                            <div className="flex items-center gap-3">
                                <Volume2 className={cn(
                                    "w-5 h-5 transition-colors",
                                    settings.soundEnabled ? "text-terminal-green" : "text-zinc-600"
                                )} />
                                <div>
                                    <div className="text-sm font-space text-white">Sound Effects</div>
                                    <div className="text-[9px] text-zinc-500 font-mono">Audio feedback on actions</div>
                                </div>
                            </div>
                            <div className={cn(
                                "w-11 h-6 rounded-full relative transition-colors",
                                settings.soundEnabled ? "bg-terminal-green/30" : "bg-zinc-800"
                            )}>
                                <div className={cn(
                                    "absolute top-1 w-4 h-4 rounded-full transition-all",
                                    settings.soundEnabled
                                        ? "left-6 bg-terminal-green"
                                        : "left-1 bg-zinc-600"
                                )} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─────────────────────────────────────────────────────────── */}
                {/* CARD 2: STORAGE CONFIG */}
                {/* ─────────────────────────────────────────────────────────── */}
                <div
                    className="relative border border-terminal-green/20 bg-black/40 overflow-hidden"
                    style={{ clipPath: 'polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))' }}
                >
                    <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-terminal-green/40" />
                    <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-terminal-green/40" />

                    <div className="px-5 py-4 border-b border-terminal-green/10">
                        <div className="flex items-center gap-2">
                            <HardDrive className="w-4 h-4 text-terminal-green/60" />
                            <span className="text-[11px] font-space font-bold text-white tracking-[0.2em]">STORAGE_CONFIG</span>
                        </div>
                    </div>

                    <div className="p-5">
                        <div className="text-[9px] text-zinc-600 font-mono mb-3 tracking-wider">
                            BACKUP_OUTPUT_DIRECTORY
                        </div>

                        <div className="bg-black/60 border border-terminal-green/10 p-4 mb-4 flex items-center justify-between group hover:border-terminal-green/30 transition-colors">
                            <div className="flex items-center overflow-hidden flex-1">
                                <FolderOpen className="w-5 h-5 text-terminal-green/50 mr-3 shrink-0" />
                                <span className="text-[11px] font-mono text-terminal-green tracking-tight truncate" title={displayPath}>
                                    {displayPath}
                                </span>
                            </div>
                            {settings.backupPath && (
                                <span className="text-[8px] font-mono text-amber-500/80 ml-2 shrink-0 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20">CUSTOM</span>
                            )}
                        </div>

                        <button
                            onClick={handleOpenModal}
                            className="w-full py-3 border border-terminal-green/40 text-terminal-green font-space font-bold text-[10px] tracking-[0.25em] hover:bg-terminal-green hover:text-black transition-all"
                        >
                            MODIFY_PATH
                        </button>

                        <div className="mt-4 text-[9px] text-zinc-600 font-mono leading-relaxed">
                            All encrypted backup archives (.easybckp) will be stored in this directory.
                        </div>
                    </div>
                </div>

                {/* ─────────────────────────────────────────────────────────── */}
                {/* CARD 3: PLACEHOLDER FOR FUTURE SETTINGS */}
                {/* Yeni ayar kartları buraya eklenebilir */}
                {/* ─────────────────────────────────────────────────────────── */}
                {/* 
                <div className="relative border border-terminal-green/20 bg-black/40 overflow-hidden border-dashed opacity-30">
                    <div className="p-8 flex flex-col items-center justify-center text-center">
                        <div className="text-2xl mb-2">➕</div>
                        <div className="text-[10px] font-mono text-zinc-600 tracking-widest">MORE_OPTIONS_COMING</div>
                    </div>
                </div>
                */}

            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* PATH SELECTION MODAL */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {showPathModal && (
                <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div
                        className="relative border border-terminal-green/40 bg-black/95 max-w-lg w-full shadow-[0_0_80px_rgba(34,197,94,0.1)] overflow-hidden"
                        style={{ clipPath: 'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))' }}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-terminal-green/20 bg-terminal-green/5">
                            <div className="flex items-center gap-3">
                                <FolderOpen className="w-5 h-5 text-terminal-green" />
                                <h3 className="font-space font-black text-white text-sm tracking-widest">SELECT_DIRECTORY</h3>
                            </div>
                            <button
                                onClick={() => setShowPathModal(false)}
                                className="p-1.5 hover:bg-terminal-green/10 transition-colors border border-transparent hover:border-terminal-green/30"
                            >
                                <X className="w-4 h-4 text-zinc-500 hover:text-white" />
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="text-[10px] text-zinc-500 font-mono mb-4">
                                Specify target directory for backup storage. Folder will be created if it doesn't exist.
                            </div>

                            <div className="relative mb-5">
                                <input
                                    type="text"
                                    value={inputPath}
                                    onChange={(e) => setInputPath(e.target.value)}
                                    placeholder="C:\Users\YourName\EasyADB_Backups"
                                    className="w-full bg-black/80 border border-terminal-green/30 text-terminal-green font-mono text-sm p-4 pr-14 focus:border-terminal-green focus:outline-none placeholder:text-zinc-600"
                                />
                                <button
                                    onClick={openFolderDialog}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-green/40 hover:text-terminal-green cursor-pointer transition-colors p-2 hover:bg-terminal-green/10 border border-transparent hover:border-terminal-green/30"
                                    title="Browse folders"
                                >
                                    📁
                                </button>
                            </div>

                            <div className="text-[9px] text-zinc-600 font-mono mb-2 tracking-widest">QUICK_SELECT</div>
                            <div className="space-y-2 mb-4">
                                <button
                                    onClick={() => setInputPath(defaultPath)}
                                    className="w-full text-left p-3 border border-terminal-green/10 hover:border-terminal-green/30 transition-colors group bg-black/30"
                                >
                                    <div className="flex items-center gap-2">
                                        <RefreshCw className="w-3 h-3 text-zinc-600 group-hover:text-terminal-green" />
                                        <span className="text-[10px] font-mono text-zinc-400 group-hover:text-terminal-green">Default (Downloads)</span>
                                    </div>
                                    <div className="text-[9px] font-mono text-zinc-600 mt-1 truncate">{defaultPath}</div>
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4 border-t border-terminal-green/20 bg-black/50">
                            <button
                                onClick={handleResetToDefault}
                                className="px-4 py-2 text-[9px] font-mono text-zinc-500 hover:text-terminal-green transition-colors tracking-wider"
                            >
                                RESET_DEFAULT
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowPathModal(false)}
                                    className="px-5 py-2 border border-zinc-700 text-zinc-400 font-space font-bold text-[9px] tracking-widest hover:border-zinc-500 hover:text-white transition-colors"
                                >
                                    CANCEL
                                </button>
                                <button
                                    onClick={handleSavePath}
                                    className="px-5 py-2 border border-terminal-green bg-terminal-green/10 text-terminal-green font-space font-bold text-[9px] tracking-widest hover:bg-terminal-green hover:text-black transition-colors flex items-center gap-2"
                                >
                                    <Check className="w-3 h-3" />
                                    CONFIRM
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
