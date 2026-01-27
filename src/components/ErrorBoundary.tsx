import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-full bg-black text-red-500 p-10 font-mono flex flex-col items-center justify-center">
                    <h1 className="text-2xl font-bold mb-4">CRITICAL RENDER ERROR</h1>
                    <div className="bg-zinc-900 p-6 border border-red-900 rounded max-w-3xl w-full overflow-auto">
                        <p className="text-lg font-bold mb-2">{this.state.error?.name}: {this.state.error?.message}</p>
                        <pre className="text-xs text-zinc-500 whitespace-pre-wrap">{this.state.error?.stack}</pre>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-8 px-6 py-3 border border-red-500 text-red-500 hover:bg-red-500 hover:text-black transition-colors"
                    >
                        RELOAD APPLICATION
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
