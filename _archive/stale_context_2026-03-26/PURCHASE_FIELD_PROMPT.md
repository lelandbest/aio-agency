# Purchase Form Element Implementation Prompt

## Overview
The Purchase form element is a specialized field type that allows forms to collect payment information. It integrates with the Orders module and supports various payment providers (Stripe, PayPal).

## Field Configuration
The purchase field has several configuration sections:

### 1. Products
- **allowMultipleProducts**: Checkbox to allow selecting multiple products (default: false)

### 2. Pricing
- **showProductPrices**: Checkbox to display product prices (default: true)
- **showTotalPrice**: Checkbox to display total price summary (default: false)

### 3. Payment
- **showCouponCode**: Checkbox to show coupon/discount code input (default: false)
- **showCreditCardInput**: Checkbox to show credit card input fields (default: false)
- **collectCardHolderName**: Checkbox to collect cardholder name (default: false)
- **showCvv**: Checkbox to show CVV field (default: false)

### 4. Customer Info
- **collectEmail**: Checkbox to collect email address (default: false)
- **collectPhone**: Checkbox to collect phone number (default: false)
- **collectBillingAddress**: Dropdown to collect billing address (options: none, zip, full)

### 5. Confirmation
- **addBillingConfirmation**: Checkbox to show billing confirmation (default: false)
- **billingConfirmationText**: Textarea for confirmation text (supports {offer_price} token)

### 6. Notifications
- **disableDefaultWelcomeEmail**: Checkbox to disable welcome email (default: false)
- **disableDefaultPaymentConfirmation**: Checkbox to disable payment confirmation email (default: false)

## Implementation Notes

### Frontend Config Panel
The purchase field config panel should render when:
1. `selectedField.type === 'purchase'`
2. The "Purchase" tab is active

It should follow the same pattern as other field config panels (validation, display, etc.) with sections organized by configuration category.

### Public Form Renderer
The purchase field in public form preview should show:
- A bordered container with purchase field indicator
- Product selection UI (if applicable)
- Price display
- Payment form fields (if enabled)

### Backend Integration
- Payment provider endpoints needed for Stripe/PayPal integration
- Orders module receives purchase data
- Form submission creates order records

## Code Pattern
```jsx
{activeTab === 'purchase' && selectedField.type === 'purchase' && (
  <div className="space-y-4">
    {/* Products Section */}
    <div className="border-b border-[var(--color-border)] pb-4">
      <h4 className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-3">Products</h4>
      {/* Configuration checkboxes */}
    </div>
    
    {/* Pricing Section */}
    {/* Payment Section */}
    {/* Customer Info Section */}
    {/* Confirmation Section */}
    {/* Notifications Section */}
  </div>
)}
```

## File Locations
- Config panel: `frontend/src/modules/Forms/index.jsx`
- Public renderer: `frontend/src/pages/PublicForm.jsx`
- Backend: `backend/server.py`, `backend/data_provider.py`
- Integration configs: `frontend/src/modules/Integrations/utils/integrationConfigs.js`
