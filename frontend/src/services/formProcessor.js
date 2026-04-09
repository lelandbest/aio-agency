/**
 * Form Submission Processor
 * Handles form submissions, contact creation/updates, CMS storage, activity tracking, and Comms threads
 */

import { getCmsTableDataApi, submitFormApi } from './backendApi';
import { listTableRecords } from './commsService';

export const processFormSubmission = async (formId, formData) => {
  try {
    return await submitFormApi(formId, formData);
  } catch (error) {
    console.error('Form submission processing error:', error);
    throw error;
  }
};

export const getFormSubmissions = async (formId) => listTableRecords('form_submissions')
  .filter((submission) => submission.form_id === formId)
  .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

export const getCMSTableData = async (formSlug) => {
  const data = await getCmsTableDataApi(formSlug);
  return (data || []).sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
};

export const exportCMSToCSV = async (formSlug, formName) => {
  const data = await getCMSTableData(formSlug);
  if (!data.length) {
    throw new Error('No data to export');
  }

  const headers = [...new Set(data.flatMap((row) => Object.keys(row)))];
  const csvRows = [headers.join(',')];
  data.forEach((row) => {
    csvRows.push(headers.map((header) => {
      const value = row[header];
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value || '';
    }).join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${formName.replace(/\s+/g, '_')}_submissions_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
