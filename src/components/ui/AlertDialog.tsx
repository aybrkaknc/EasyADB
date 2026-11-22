import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useEffect } from 'react';

interface AlertDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    onClose: () => void;
    variant?: 'error' | 'warning' | 'info';
    // Confirmation Mode
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
}

export function AlertDialog({
    isOpen,
    title,
    message,
    onClose,
    variant = 'error',
    onConfirm,
    confirmText = "CONFIRM",
    cancelText = "CANCEL"
}: AlertDialogProps) {
    // Otomatik kapanma sayacı (isteğe bağlı, şu an sadece manuel)

    // ESC ile kapatma
    useEffect(() => {
        if (!isOpen) return;
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const colors = {
        error: {
            border: "border-red-500/30",
            bg: "bg-red-950/20",
            text: "text-red-500",
            glow: "shadow-[0_0_30px_rgba(239,68,68,0.2)]"
        },
        warning: {
            border: "border-yellow-500/30",
            bg: "bg-yellow-950/20",
            text: "text-yellow-500",
            glow: "shadow-[0_0_30px_rgba(234,179,8,0.2)]"
        },
        info: {
            border: "border-blue-500/30",
            bg: "bg-blue-950/20",
            text: "text-blue-500",
            glow: "shadow-[0_0_30px_rgba(59,130,246,0.2)]"
        }
    }[variant];

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[250] flex items-center justify-center pointer-events-none">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                    onClick={onClose}
                />

                {/* Dialog Box */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className={cn(
                        "relative w-[450px] overflow-hidden backdrop-blur-xl pointer-events-auto",
                        "border border-l-4",
                        colors.border,
                        "bg-black/80",
                        colors.glow
                    )}
                >
                    {/* Header */}
                    <div className={cn("flex items-center justify-between px-4 py-3 border-b", colors.border, colors.bg)}>
                        <div className="flex items-center gap-2">
                            <AlertTriangle className={cn("w-4 h-4", colors.text)} />
                            <span className={cn("font-space font-bold text-xs tracking-[0.2em] uppercase", colors.text)}>
                                SYSTEM_{variant.toUpperCase()}
                            </span>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-white/40 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="p-6 relative">
                        {/* Scanlines */}
                        <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[size:100%_4px] pointer-events-none opacity-20" />

                        <h3 className="text-white font-space font-bold text-lg mb-2 flex items-center gap-2">
                            {title}
                        </h3>

                        <div className="font-mono text-sm text-white/70 leading-relaxed break-words">
                            <span className={cn("mr-2", colors.text)}>{">"}</span>
                            {message}
                        </div>

                        {/* Footer / Actions */}
                        <div className="mt-6 flex justify-end">
                            {onConfirm ? (
                                <div className="flex gap-3">
                                    <button
                                        onClick={onClose}
                                        className={cn(
                                            "px-4 py-2 text-xs font-bold font-space uppercase tracking-widest transition-all",
                                            "text-white/40 hover:text-white"
                                        )}
                                    >
                                        [ {cancelText} ]
                                    </button>
                                    <button
                                        onClick={onConfirm}
                                        className={cn(
                                            "px-6 py-2 text-xs font-bold font-space uppercase tracking-widest transition-all",
                                            "bg-white/5 hover:bg-white/10 border",
                                            colors.border,
                                            colors.text
                                        )}
                                    >
                                        [ {confirmText} ]
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={onClose}
                                    className={cn(
                                        "px-6 py-2 text-xs font-bold font-space uppercase tracking-widest transition-all",
                                        "bg-white/5 hover:bg-white/10 border",
                                        colors.border,
                                        colors.text
                                    )}
                                >
                                    [ ACKNOWLEDGE ]
                                </button>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
