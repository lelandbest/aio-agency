import React from 'react';
import PropTypes from 'prop-types';
import { Tag as TagIcon, Settings, User, Star } from 'lucide-react';

/**
 * Tag Component
 * Globally consistent tag styling for System, User, and Custom tags.
 * 
 * Usage:
 * <Tag type="system">Automated</Tag>
 * <Tag type="user">VIP Client</Tag>
 * <Tag type="custom" color="purple">Special Event</Tag>
 */
const Tag = ({ children, type = 'user', className = '', icon = true, onClick }) => {

    // Determine style class based on type
    const getTagClass = () => {
        switch (type.toLowerCase()) {
            case 'system': return 'tag-system';
            case 'user': return 'tag-user';
            case 'custom': return 'tag-custom';
            case 'alert': return 'tag-alert';
            case 'warning': return 'tag-warning';
            default: return 'tag-user';
        }
    };

    // Optional icon based on type
    const getIcon = () => {
        if (!icon) return null;
        switch (type.toLowerCase()) {
            case 'system': return <Settings size={10} />;
            case 'user': return <User size={10} />;
            case 'custom': return <TagIcon size={10} />;
            case 'alert': return <Star size={10} />; // Or alert icon
            default: return null;
        }
    };

    return (
        <span
            className={`tag-base ${getTagClass()} ${className} ${onClick ? 'cursor-pointer hover:opacity-90' : ''}`}
            onClick={onClick}
        >
            {getIcon()}
            {children}
        </span>
    );
};

Tag.propTypes = {
    children: PropTypes.node.isRequired,
    type: PropTypes.oneOf(['system', 'user', 'custom', 'alert', 'warning']),
    className: PropTypes.string,
    icon: PropTypes.bool,
    onClick: PropTypes.func
};

export default Tag;
