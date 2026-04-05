import React from 'react';
import PropTypes from 'prop-types';

/**
 * ErrorBoundary Component
 * Catches React errors and displays a fallback UI
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('App Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-black p-8 font-mono text-red-500">
                    <h1 className="text-2xl font-bold mb-4">React Error Caught</h1>
                    <p className="mb-2">{this.state.error?.toString()}</p>
                    <pre className="whitespace-pre-wrap break-words text-sm">
                        {this.state.error?.stack}
                    </pre>
                </div>
            );
        }

        return this.props.children;
    }
}

ErrorBoundary.propTypes = {
    children: PropTypes.node.isRequired,
};

export default ErrorBoundary;

