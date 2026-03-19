import React, { useEffect, useState } from 'react';
import { getFormBySlugApi } from '../services/backendApi';
import { processFormSubmission } from '../services/formProcessor';

const PublicForm = ({ formSlug }) => {
  const [form, setForm] = useState(null);
  const [formData, setFormData] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadForm = async () => {
      setLoading(true);
      try {
        const data = await getFormBySlugApi(formSlug);
        if (!data) {
          setError('Form not found');
          setLoading(false);
          return;
        }
        if (!data.is_active) {
          setError('This form is no longer accepting submissions');
          setLoading(false);
          return;
        }
        setForm(data);
        setError(null);
      } catch (loadError) {
        console.error('Form load error:', loadError);
        setError('Unable to load form. Confirm the local backend is running.');
      } finally {
        setLoading(false);
      }
    };

    loadForm();
  }, [formSlug]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const missingFields = form.schema.filter((field) => field.required && !formData[field.name]).map((field) => field.label);
      if (missingFields.length) {
        setError(`Please fill in required fields: ${missingFields.join(', ')}`);
        setSubmitting(false);
        return;
      }
      await processFormSubmission(form.id, formData);
      setSubmitted(true);
      if (form.settings.redirect_url) {
        setTimeout(() => {
          window.location.href = form.settings.redirect_url;
        }, 2000);
      }
    } catch (submitError) {
      console.error('Form submission error:', submitError);
      setError('Error submitting form. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (fieldName, value) => setFormData((current) => ({ ...current, [fieldName]: value }));

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div><p className="mt-4 text-gray-600">Loading form...</p></div></div>;
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><div className="text-center max-w-md"><div className="text-6xl mb-4">Warning</div><h2 className="text-2xl font-bold text-gray-900 mb-2">{error}</h2><button onClick={() => window.location.href = '/'} className="mt-6 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Go Home</button></div></div>;
  }

  if (submitted) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><div className="text-center max-w-md"><div className="text-6xl mb-4">Done</div><h2 className="text-3xl font-bold text-gray-900 mb-4">Thank You!</h2><p className="text-lg text-gray-600 mb-6">{form.settings.thank_you_message || 'Your submission has been received. We will get back to you soon.'}</p>{form.settings.redirect_url && <p className="text-sm text-gray-500">Redirecting...</p>}</div></div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-cyan-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{form.name}</h1>
            {form.description && <p className="text-gray-600">{form.description}</p>}
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            {form.schema.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-2">{field.label}{field.required && <span className="text-red-500 ml-1">*</span>}</label>
                {['text', 'email', 'phone', 'date'].includes(field.type) && <input type={field.type === 'phone' ? 'tel' : field.type} required={field.required} placeholder={field.placeholder} value={formData[field.name] || ''} onChange={(event) => handleChange(field.name, event.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent" />}
                {field.type === 'textarea' && <textarea required={field.required} placeholder={field.placeholder} value={formData[field.name] || ''} onChange={(event) => handleChange(field.name, event.target.value)} rows={4} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent" />}
                {field.type === 'select' && <select required={field.required} value={formData[field.name] || ''} onChange={(event) => handleChange(field.name, event.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"><option value="">Select...</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>}
                {field.type === 'checkbox' && <div className="flex items-center"><input type="checkbox" required={field.required} checked={formData[field.name] || false} onChange={(event) => handleChange(field.name, event.target.checked)} className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded" /><span className="ml-2 text-sm text-gray-600">{field.placeholder}</span></div>}
              </div>
            ))}
            {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg"><p className="text-sm text-red-600">{error}</p></div>}
            <button type="submit" disabled={submitting} className="w-full py-3 px-6 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors duration-200">{submitting ? 'Submitting...' : 'Submit'}</button>
          </form>
          <div className="mt-8 pt-6 border-t border-gray-200 text-center"><p className="text-sm text-gray-500">Powered by AIO CRM</p></div>
        </div>
      </div>
    </div>
  );
};

export default PublicForm;
