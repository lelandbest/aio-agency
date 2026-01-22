import React from 'react';

/**
 * IntegrationTabs Component
 * Tab navigation for different integration categories
 */
export const IntegrationTabs = ({
  categories,
  activeCategory,
  onCategoryChange,
  counts,
}) => {
  return (
    <div className="border-b border-[var(--color-border)]">
      <div className="flex gap-1">
        {categories.map((category) => (
          <button
            key={category.id}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-all cursor-pointer ${
              activeCategory === category.id 
                ? 'border-b-blue-500 text-blue-500' 
                : 'border-b-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
            onClick={() => onCategoryChange(category.id)}
          >
            <span>{category.name}</span>
            {counts && counts[category.id] > 0 && (
              <span className="ml-2 inline-block px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                {counts[category.id]}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default IntegrationTabs;

