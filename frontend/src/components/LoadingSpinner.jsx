import React from 'react';

/**
 * LoadingSpinner Component
 * Reusable loading spinner with different sizes
 */
const LoadingSpinner = ({ size = 'md', message = '' }) => {
    const sizeClasses = {
        sm: 'w-4 h-4 border-2',
        md: 'w-8 h-8 border-2',
        lg: 'w-12 h-12 border-3',
        xl: 'w-16 h-16 border-4'
    };

    return (
        <div className="flex flex-col items-center justify-center gap-3">
            <div
                className={`${sizeClasses[size]} border-purple-600 border-t-transparent rounded-full animate-spin`}
                role="status"
                aria-label="Loading"
            />
            {message && (
                <p className="text-sm text-[var(--color-text-secondary)]">
                    {message}
                </p>
            )}
        </div>
    );
};

export default LoadingSpinner;
