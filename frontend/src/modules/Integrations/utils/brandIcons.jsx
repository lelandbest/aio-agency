/**
 * Brand Icon Mappings
 * Maps provider IDs to icon components and branding information
 */

import React from 'react';

/**
 * Simple SVG icon components for providers
 * These are fallbacks when CDN logos aren't available
 */
export const getBrandIcon = (providerId, size = 48) => {
  const icons = {
    n8n: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#EA4B71" width="48" height="48" rx="8" />
        <path d="M14 31V17L24 25V17L34 25V31" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    activepieces: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#6D5EF8" width="48" height="48" rx="8" />
        <path d="M16 24H32M24 16V32" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="24" cy="24" r="10" stroke="white" strokeWidth="3.2" />
      </svg>
    ),
    zapier: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#FF4F00" width="48" height="48" rx="8" />
        <path d="M12 24L24 12L36 24L24 36Z" fill="white" />
      </svg>
    ),
    make: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#1D1D1D" width="48" height="48" rx="8" />
        <text x="50%" y="50%" fontSize="28" fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">
          M
        </text>
      </svg>
    ),
    google: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#4285F4" width="48" height="48" rx="8" />
        <text x="50%" y="50%" fontSize="24" fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">
          G
        </text>
      </svg>
    ),
    microsoft: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#00A4EF" width="24" height="24" />
        <rect fill="#7FBA00" x="24" y="0" width="24" height="24" />
        <rect fill="#FFB900" x="0" y="24" width="24" height="24" />
        <rect fill="#F25022" x="24" y="24" width="24" height="24" />
      </svg>
    ),
    aws: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#FF9900" width="48" height="48" rx="8" />
        <text x="50%" y="50%" fontSize="20" fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">
          AWS
        </text>
      </svg>
    ),
    sendgrid: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#1A1A1A" width="48" height="48" rx="8" />
        <circle cx="24" cy="24" r="12" fill="#00D9FF" />
      </svg>
    ),
    mailgun: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#EA6B5E" width="48" height="48" rx="8" />
        <path d="M12 16L24 24L36 16" stroke="white" strokeWidth="2" fill="none" />
        <path d="M12 16H36V32H12Z" stroke="white" strokeWidth="2" fill="none" />
      </svg>
    ),
    email: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#4A90E2" width="48" height="48" rx="8" />
        <path d="M12 16H36V32H12Z" stroke="white" strokeWidth="2" fill="none" />
        <path d="M12 16L24 24L36 16" stroke="white" strokeWidth="2" fill="none" />
      </svg>
    ),
    'local-stub': (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#334155" width="48" height="48" rx="8" />
        <rect x="12" y="13" width="24" height="22" rx="3" stroke="white" strokeWidth="2.5" />
        <path d="M18 19H30M18 24H30M18 29H26" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
    'smtp-imap': (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#2563EB" width="48" height="48" rx="8" />
        <path d="M12 17H36V31H12Z" stroke="white" strokeWidth="2.5" fill="none" />
        <path d="M12 18L24 26L36 18" stroke="white" strokeWidth="2.5" fill="none" />
        <path d="M18 35H30" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
    'gmail-oauth': (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#FFFFFF" width="48" height="48" rx="8" />
        <path d="M10 16L24 27L38 16V32H10V16Z" fill="#EA4335" />
        <path d="M10 16V32H16V21L24 27L32 21V32H38V16L24 27L10 16Z" fill="#4285F4" />
        <path d="M10 16L24 27L38 16L34.5 13H13.5L10 16Z" fill="#34A853" />
        <path d="M10 16L14 13H34L38 16H10Z" fill="#FBBC05" />
      </svg>
    ),
    'microsoft365-oauth': (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#0F172A" width="48" height="48" rx="8" />
        <rect fill="#F25022" x="10" y="10" width="12" height="12" />
        <rect fill="#7FBA00" x="26" y="10" width="12" height="12" />
        <rect fill="#00A4EF" x="10" y="26" width="12" height="12" />
        <rect fill="#FFB900" x="26" y="26" width="12" height="12" />
      </svg>
    ),
    openai: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#10A37F" width="48" height="48" rx="8" />
        <circle cx="24" cy="24" r="10" fill="white" />
        <path d="M24 14V34M14 24H34" stroke="#10A37F" strokeWidth="2" />
      </svg>
    ),
    openrouter: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#0F172A" width="48" height="48" rx="8" />
        <path d="M14 18C14 15.7909 15.7909 14 18 14H29C32.866 14 36 17.134 36 21" stroke="#60A5FA" strokeWidth="3" strokeLinecap="round" />
        <path d="M34 18L36 21L33 23" stroke="#60A5FA" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M34 30C34 32.2091 32.2091 34 30 34H19C15.134 34 12 30.866 12 27" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
        <path d="M14 30L12 27L15 25" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    anthropic: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#8B5CF6" width="48" height="48" rx="8" />
        <path d="M24 12L36 32H12Z" fill="white" />
      </svg>
    ),
    ollama: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#111827" width="48" height="48" rx="8" />
        <ellipse cx="17" cy="18" rx="5" ry="6" fill="#F9FAFB" />
        <ellipse cx="31" cy="18" rx="5" ry="6" fill="#F9FAFB" />
        <path d="M14 30C16.2 26.5 19.4 24.75 24 24.75C28.6 24.75 31.8 26.5 34 30" stroke="#F9FAFB" strokeWidth="3" strokeLinecap="round" />
      </svg>
    ),
    perplexity: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#111827" width="48" height="48" rx="8" />
        <path d="M16 13H27C31.4183 13 35 16.5817 35 21C35 25.4183 31.4183 29 27 29H18V35" stroke="#22C55E" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 35V23H27" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    twilio: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#F22F46" width="48" height="48" rx="8" />
        <circle cx="16" cy="24" r="4" fill="white" />
        <circle cx="24" cy="24" r="4" fill="white" />
        <circle cx="32" cy="24" r="4" fill="white" />
      </svg>
    ),
    plivo: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#00B8E1" width="48" height="48" rx="8" />
        <text x="50%" y="50%" fontSize="24" fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">
          P
        </text>
      </svg>
    ),
    sms: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#34C759" width="48" height="48" rx="8" />
        <path d="M12 14H36C37.1 14 38 14.9 38 16V32C38 33.1 37.1 34 36 34H12C10.9 34 10 33.1 10 32V16C10 14.9 10.9 14 12 14Z" fill="white" />
        <path d="M24 24L12 16V32L24 24" fill="#34C759" />
      </svg>
    ),
    facebook: (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#1877F2" width="48" height="48" rx="8" />
        <path d="M20 14H24V20H28V24H24V36H20V24H16V20H20V14Z" fill="white" />
      </svg>
    ),
    'google-calendar-oauth': (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#FFFFFF" width="48" height="48" rx="8" />
        <rect x="10" y="13" width="28" height="24" rx="4" fill="#4285F4" />
        <rect x="10" y="13" width="28" height="7" rx="4" fill="#34A853" />
        <path d="M17 10V17M31 10V17" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
        <text x="24" y="33" fontSize="14" fontWeight="bold" fill="white" textAnchor="middle">31</text>
      </svg>
    ),
    'microsoft365-calendar': (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#111827" width="48" height="48" rx="8" />
        <rect x="10" y="12" width="28" height="26" rx="4" fill="#2563EB" />
        <path d="M16 10V18M32 10V18" stroke="#DBEAFE" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M10 20H38" stroke="#DBEAFE" strokeWidth="2.5" />
        <rect x="16" y="24" width="6" height="6" rx="1.5" fill="#DBEAFE" />
        <rect x="26" y="24" width="6" height="6" rx="1.5" fill="#DBEAFE" opacity="0.75" />
      </svg>
    ),
    'ics-url': (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <rect fill="#0F766E" width="48" height="48" rx="8" />
        <path d="M15 12H29L35 18V36H15V12Z" fill="white" opacity="0.95" />
        <path d="M29 12V18H35" fill="#99F6E4" />
        <path d="M19 23H31M19 28H31M19 33H27" stroke="#0F766E" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  };

  return icons[providerId] || <DefaultIcon size={size} />;
};

/**
 * Default icon for unknown providers
 */
const DefaultIcon = ({ size = 48 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
    <rect fill="#9CA3AF" width="48" height="48" rx="8" />
    <circle cx="24" cy="18" r="4" fill="white" />
    <path d="M16 32C16 27.58 19.58 24 24 24C28.42 24 32 27.58 32 32" stroke="white" strokeWidth="2" fill="none" />
  </svg>
);

/**
 * Get brand colors for providers
 */
export const getBrandColors = (providerId) => {
  const colors = {
    n8n: { primary: '#EA4B71', secondary: '#FFE4EC' },
    activepieces: { primary: '#6D5EF8', secondary: '#ECE9FF' },
    zapier: { primary: '#FF4F00', secondary: '#FFE5CC' },
    make: { primary: '#1D1D1D', secondary: '#F0F0F0' },
    google: { primary: '#4285F4', secondary: '#E8F0FE' },
    microsoft: { primary: '#00A4EF', secondary: '#E3F2FD' },
    aws: { primary: '#FF9900', secondary: '#FFF3E0' },
    sendgrid: { primary: '#1A1A1A', secondary: '#E0F2F1' },
    mailgun: { primary: '#EA6B5E', secondary: '#FFEBEE' },
    'local-stub': { primary: '#475569', secondary: '#E2E8F0' },
    'smtp-imap': { primary: '#2563EB', secondary: '#DBEAFE' },
    'gmail-oauth': { primary: '#EA4335', secondary: '#FEE2E2' },
    'microsoft365-oauth': { primary: '#0F172A', secondary: '#E2E8F0' },
    openai: { primary: '#10A37F', secondary: '#E0F2F1' },
    openrouter: { primary: '#38BDF8', secondary: '#E0F2FE' },
    anthropic: { primary: '#8B5CF6', secondary: '#F3E8FF' },
    ollama: { primary: '#111827', secondary: '#E5E7EB' },
    perplexity: { primary: '#22C55E', secondary: '#DCFCE7' },
    twilio: { primary: '#F22F46', secondary: '#FFE5E5' },
    plivo: { primary: '#00B8E1', secondary: '#E0F7FA' },
    sms: { primary: '#34C759', secondary: '#E8F5E9' },
    facebook: { primary: '#1877F2', secondary: '#E3F2FD' },
    'google-calendar-oauth': { primary: '#4285F4', secondary: '#E8F0FE' },
    'microsoft365-calendar': { primary: '#2563EB', secondary: '#DBEAFE' },
    'ics-url': { primary: '#0F766E', secondary: '#CCFBF1' },
  };

  return colors[providerId] || { primary: '#9CA3AF', secondary: '#F3F4F6' };
};

/**
 * Get provider display name
 */
export const getProviderDisplayName = (providerId) => {
  const names = {
    n8n: 'n8n',
    activepieces: 'Activepieces',
    zapier: 'Zapier',
    make: 'Make',
    google: 'Google',
    google_calendar: 'Google Calendar',
    google_ai: 'Google AI',
    'google-ai': 'Google AI',
    'google-calendar-oauth': 'Google Calendar',
    microsoft: 'Microsoft',
    ms_365: 'Microsoft 365',
    'microsoft365-oauth': 'Microsoft 365 Mail',
    'microsoft365-calendar': 'Microsoft 365 Calendar',
    aws: 'AWS',
    aws_ses: 'AWS SES',
    sendgrid: 'SendGrid',
    mailgun: 'Mailgun',
    'local-stub': 'Local Stub',
    'smtp-imap': 'SMTP / IMAP',
    'gmail-oauth': 'Gmail OAuth',
    'ics-url': 'ICS Feed',
    ollama: 'Ollama',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    anthropic: 'Anthropic',
    perplexity: 'Perplexity',
    twilio: 'Twilio',
    plivo: 'Plivo',
    sms_everyone: 'SMS Everyone',
    facebook: 'Facebook',
    fb_pixel: 'Facebook Pixel',
  };

  return names[providerId] || 'Unknown Provider';
};

