import { ReactNode } from 'react';
import { ModuleType } from '../../context/AppContext';
import { cn } from '../../lib/utils';

interface ModuleContainerProps {
    activeModule: ModuleType;
    children: ReactNode;
}

/**
 * ModuleContainer: Aktif modülün içeriğini saran wrapper.
 * Modül geçişlerinde fade animasyonu uygular.
 */
export function ModuleContainer({ activeModule, children }: ModuleContainerProps) {
    return (
        <div
            key={activeModule}
            className={cn(
                "flex-1 flex flex-col overflow-hidden",
                "animate-fade-in"
            )}
        >
            {children}
        </div>
    );
}
