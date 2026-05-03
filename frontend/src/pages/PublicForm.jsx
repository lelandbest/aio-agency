import React, { useEffect, useState } from 'react';
import { FormsService } from '../services/forms.service';
import { normalizeSourceUrl } from '../utils/url.utils';
import { processFormSubmission } from '../services/formProcessor';

const normalizePublicFormSettings = (settings = {}) => {
  const source = settings || {};
  let rawHeaderImage = (
    source.headerImage || 
    source.header_image || 
    source.heroImage || 
    source.hero_image || 
    ''
  );
  if (rawHeaderImage && typeof rawHeaderImage === 'object') {
    rawHeaderImage = rawHeaderImage.sourceUrl || rawHeaderImage.url || '';
  }
  return {
    redirectUrl: source.redirectUrl || source.redirect_url || '',
    thankYouMessage: source.thankYouMessage || source.thank_you_message || 'Your submission has been received. We will get back to you soon.',
    headerImage: normalizeSourceUrl(rawHeaderImage),
    headerImageFit: source.headerImageFit || source.header_image_fit || 'cover',
  };
};

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
        const data = await FormsService.getFormBySlug(formSlug);
        if (!data) {
          setError('Form not found');
          setLoading(false);
          return;
        }
        if (!data.isActive) {
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
      const settings = normalizePublicFormSettings(form.settings);
      if (settings.redirectUrl) {
        setTimeout(() => {
          window.location.href = settings.redirectUrl;
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
    const settings = normalizePublicFormSettings(form.settings);
    return <div className="min-h-screen flex items-center justify-center bg-white"><div className="text-center max-w-md"><div className="text-6xl mb-4">Done</div><h2 className="text-3xl font-bold text-gray-900 mb-4">Thank You!</h2><p className="text-lg text-gray-600 mb-6">{settings.thankYouMessage}</p>{settings.redirectUrl && <p className="text-sm text-gray-500">Redirecting...</p>}</div></div>;
  }

  const settings = normalizePublicFormSettings(form.settings);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-cyan-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {settings.headerImage ? (
            <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200">
              <img
                src={settings.headerImage}
                alt={`${form.name} header`}
                className="h-48 w-full"
                style={{ objectFit: settings.headerImageFit || 'cover' }}
              />
            </div>
          ) : null}
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
                {field.type === 'purchase' && (
                  <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 space-y-4 mt-4">
                    <h3 className="text-lg font-bold text-[var(--color-primary)] border-b border-gray-200 pb-2">Payment Details</h3>
                    <div className="space-y-4 pt-2">
                       {/* Product Selection Placeholder */}
                       <div className="flex items-center justify-between p-3 border border-purple-200 rounded-lg bg-purple-50">
                         <label className="flex items-center cursor-pointer">
                           <input type={field.allowMultipleProducts ? "checkbox" : "radio"} className="h-4 w-4 text-purple-600 focus:ring-purple-500" defaultChecked />
                           <span className="ml-3 font-medium text-purple-900">Standard Package</span>
                         </label>
                         {field.showProductPrices !== false && <span className="font-bold text-purple-900">$99.00</span>}
                       </div>
                       
                       {field.showCouponCode && (
                         <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Coupon Code</label>
                           <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none" placeholder="Optional" />
                         </div>
                       )}

                       {/* Customer Info */}
                       {(field.collectEmail || field.collectPhone) && (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           {field.collectEmail && (
                             <div>
                               <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                               <input type="email" required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none" />
                             </div>
                           )}
                           {field.collectPhone && (
                             <div>
                               <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                               <input type="tel" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent outline-none" />
                             </div>
                           )}
                         </div>
                       )}

                       {/* Billing Address */}
                       {field.collectBillingAddress === 'full' && (
                         <div className="space-y-3">
                           <label className="block text-sm font-medium text-gray-700">Billing Address</label>
                           <input type="text" placeholder="Street Address" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 outline-none" />
                           <div className="grid grid-cols-2 gap-4">
                             <input type="text" placeholder="City" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 outline-none" />
                             <input type="text" placeholder="State/Province" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 outline-none" />
                           </div>
                           <input type="text" placeholder="Zip/Postal Code" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 outline-none" />
                         </div>
                       )}
                       {field.collectBillingAddress === 'zip' && (
                         <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Billing Zip Code</label>
                           <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 outline-none" />
                         </div>
                       )}

                       {/* Credit Card */}
                       {field.showCreditCardInput && (
                         <div className="space-y-4">
                           {field.collectCardHolderName && (
                             <div>
                               <label className="block text-sm font-medium text-gray-700 mb-1">Cardholder Name</label>
                               <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 outline-none" />
                             </div>
                           )}
                           <div className="relative">
                             <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                             <div className="flex bg-white rounded-lg border border-gray-300 px-4 py-2 focus-within:ring-2 focus-within:ring-purple-600 focus-within:border-transparent">
                               <input type="text" placeholder="0000 0000 0000 0000" className="w-full border-none p-0 focus:ring-0 outline-none" />
                               {field.showCvv && (
                                 <input type="text" placeholder="CVV" className="w-16 ml-4 pl-4 border-l border-gray-300 outline-none focus:ring-0 text-center" />
                               )}
                             </div>
                           </div>
                         </div>
                       )}

                       {field.showTotalPrice && (
                         <div className="flex justify-between items-center pt-4 border-t border-gray-200 mt-2">
                           <span className="text-gray-600 font-medium tracking-wide uppercase text-sm">Amount Due:</span>
                           <span className="text-2xl font-bold text-gray-900">$99.00</span>
                         </div>
                       )}
                    </div>
                  </div>
                )}
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
