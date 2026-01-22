/**
 * Form Submission Processor
 * Handles form submissions, contact creation/updates, CMS storage, and activity tracking
 */

import { mockSupabase } from './mockSupabase';
import { generateContactId, generateSubmissionId, generateActivityId, generateCmsId } from '../lib/ulid';

/**
 * Process a form submission
 * @param {string} formId - Form UUID
 * @param {object} formData - Form field values
 * @returns {Promise<{success: boolean, contactId: string, created: boolean}>}
 */
export const processFormSubmission = async (formId, formData) => {
  try {
    // 1. Load form schema
    const { data: form } = await mockSupabase.from('forms').select().eq('id', formId).single();
    
    if (!form) {
      throw new Error('Form not found');
    }

    // 2. Find identifier field (usually email)
    const identifierField = form.schema.find(f => f.is_identifier);
    if (!identifierField) {
      throw new Error('No identifier field configured');
    }
    
    const identifierValue = formData[identifierField.name];
    if (!identifierValue) {
      throw new Error('Identifier field value is required');
    }

    // 3. Check if contact exists
    const { data: existingContact } = await mockSupabase
      .from('crm_contacts')
      .select()
      .eq(identifierField.map_to_contact || 'email', identifierValue)
      .single();

    let contactId;
    let createdNewContact = false;

    if (existingContact) {
      // 4a. Update existing contact
      contactId = existingContact.id;

      if (form.settings.update_contact) {
        const updates = {};
        form.schema.forEach(field => {
          if (field.map_to_contact && formData[field.name]) {
            updates[field.map_to_contact] = formData[field.name];
          }
        });

        await mockSupabase
          .from('crm_contacts')
          .update({
            ...updates,
            last_contacted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', contactId);
      }
    } else {
      // 4b. Create new contact
      if (form.settings.create_contact) {
        const newContact = {
          contact_id: generateContactId(),
          organization_id: 'org-1',
          source: `Form: ${form.name}`,
          status: 'lead',
          lead_score: 50,
          quality: 'warm',
          engagement: 'medium',
          tags: [],
          opt_in_email: true,
          opt_in_sms: true,
          opt_in_calls: true,
          opt_in_automations: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        // Map form fields to contact fields
        form.schema.forEach(field => {
          if (field.map_to_contact && formData[field.name]) {
            newContact[field.map_to_contact] = formData[field.name];
          }
        });

        const { data: created } = await mockSupabase
          .from('crm_contacts')
          .insert([newContact]);

        contactId = created[0].id;
        createdNewContact = true;
      } else {
        // Form configured not to create contacts
        contactId = null;
      }
    }

    // 5. Store in form_submissions master table
    const submissionId = generateSubmissionId();
    
    await mockSupabase.from('form_submissions').insert([{
      id: submissionId,
      form_id: formId,
      contact_id: contactId,
      submission_data: formData,
      created_contact: createdNewContact,
      ip_address: '127.0.0.1',
      submitted_at: new Date().toISOString()
    }]);

    // 6. Store in CMS table (cms_{form_slug})
    const cmsTableName = `cms_${form.slug}`;
    await mockSupabase.from(cmsTableName).insert([{
      id: generateCmsId(),
      contact_id: contactId,
      form_submission_id: submissionId,
      ...formData,
      submitted_at: new Date().toISOString()
    }]);

    // 7. Create activity record
    if (contactId) {
      await mockSupabase.from('contact_activities').insert([{
        id: generateActivityId(),
        contact_id: contactId,
        activity_type: 'form',
        title: `Submitted ${form.name}`,
        description: formData.message || formData.comments || formData.inquiry || 'Form submitted',
        metadata: {
          form_id: formId,
          form_name: form.name,
          form_slug: form.slug,
          submission_id: submissionId,
          submission_data: formData
        },
        created_at: new Date().toISOString()
      }]);
    }

    // 8. Send webhook (if configured)
    if (form.settings.webhook_url) {
      console.log('📤 Webhook POST to:', form.settings.webhook_url);
      console.log('📦 Data:', { form_id: formId, contact_id: contactId, data: formData });
      // In production: await fetch(form.settings.webhook_url, { method: 'POST', body: JSON.stringify(...) })
    }

    // 9. Send notification email (if configured)
    if (form.settings.notification_email) {
      console.log('📧 Email notification to:', form.settings.notification_email);
      console.log('📨 Subject: New form submission - ' + form.name);
      console.log('📨 Data:', formData);
      // In production: send via SMTP/Gmail API
    }

    // 10. Update form response count
    await mockSupabase
      .from('forms')
      .update({
        responses_count: (form.responses_count || 0) + 1,
        last_response_at: new Date().toISOString()
      })
      .eq('id', formId);

    return { success: true, contactId, created: createdNewContact };
  } catch (error) {
    console.error('Form submission processing error:', error);
    throw error;
  }
};

/**
 * Get form submissions by form ID
 * @param {string} formId - Form UUID
 * @returns {Promise<Array>}
 */
export const getFormSubmissions = async (formId) => {
  const { data } = await mockSupabase
    .from('form_submissions')
    .select()
    .eq('form_id', formId)
    .order('submitted_at', { ascending: false });
  
  return data || [];
};

/**
 * Get CMS table data for a form
 * @param {string} formSlug - Form slug
 * @returns {Promise<Array>}
 */
export const getCMSTableData = async (formSlug) => {
  const cmsTableName = `cms_${formSlug}`;
  const { data } = await mockSupabase
    .from(cmsTableName)
    .select()
    .order('submitted_at', { ascending: false });
  
  return data || [];
};

/**
 * Export CMS table data to CSV
 * @param {string} formSlug - Form slug
 * @param {string} formName - Form name for filename
 */
export const exportCMSToCSV = async (formSlug, formName) => {
  const data = await getCMSTableData(formSlug);
  
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get all unique keys from data
  const headers = [...new Set(data.flatMap(row => Object.keys(row)))];
  
  // Create CSV content
  const csvRows = [];
  csvRows.push(headers.join(','));
  
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      // Escape commas and quotes
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value || '';
    });
    csvRows.push(values.join(','));
  });
  
  const csvContent = csvRows.join('\n');
  
  // Download file
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${formName.replace(/\s+/g, '_')}_submissions_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};
