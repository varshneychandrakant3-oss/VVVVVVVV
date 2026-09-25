/*
 * Marketplace configuration.
 *
 * Everything that depends on the country the marketplace operates in lives here:
 * currency, taxes, platform fees, legal documents required from van owners, and
 * the cancellation policies offered. To launch in another country, add a new
 * profile to COUNTRY_PROFILES and change ACTIVE_COUNTRY.
 *
 * NOTE: The India profile reflects common requirements for self-drive rental
 * vehicles (Rent-a-Motor-Cab scheme, commercial registration, PUC, fitness,
 * commercial insurance). Rules vary by state and change over time — confirm the
 * final list and tax rates with legal/tax counsel before going live.
 */
window.App = window.App || {};

App.COUNTRY_PROFILES = {
  IN: {
    code: 'IN',
    name: 'India',
    currency: 'INR',
    locale: 'en-IN',
    phonePrefix: '+91',
    taxLabel: 'GST',
    taxRate: 0.18,               // applied to rental + fees
    serviceFeeRate: 0.08,        // charged to the traveller
    ownerCommissionRate: 0.12,   // deducted from owner payout
    minDriverAge: 21,
    depositReleaseDays: 7,
    expiryWarningDays: 30,
    supportPhone: '1800-120-4455',
    emergencyNumber: '112',
    // Owner-level verification (done once per owner)
    kyc: {
      title: 'Identity verification (KYC)',
      intro: 'We verify every owner with government ID. Only the last 4 digits of your Aadhaar are stored.',
      documents: [
        { type: 'aadhaar', label: 'Aadhaar (via DigiLocker or masked copy)', idLabel: 'Aadhaar number', mask: 4, expires: false },
        { type: 'pan', label: 'PAN card', idLabel: 'PAN', pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$', expires: false },
        { type: 'selfie', label: 'Live selfie for face match', expires: false }
      ]
    },
    business: {
      taxIdLabel: 'GSTIN (optional below the GST threshold)',
      taxIdPattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
    },
    // Vehicle-level verification (done for every van)
    ownership: {
      title: 'Vehicle ownership / authorisation',
      options: [
        { value: 'owner', label: 'I am the registered owner (RC in my name)' },
        { value: 'company', label: 'Registered to my company / firm' },
        { value: 'authorised', label: 'I am authorised by the registered owner (NOC + agreement)' }
      ]
    },
    registrationDocs: [
      { type: 'rc', label: 'Registration Certificate (RC)', expires: true, required: true },
      { type: 'rent_cab_licence', label: 'Rent-a-Motor-Cab / self-drive rental licence', expires: true, required: true },
      { type: 'puc', label: 'Pollution Under Control (PUC) certificate', expires: true, required: true },
      { type: 'fitness', label: 'Fitness certificate (commercial vehicle)', expires: true, required: true },
      { type: 'tourist_permit', label: 'All India Tourist Permit (for interstate trips)', expires: true, required: false },
      { type: 'caravan_reg', label: 'Caravan registration with State Tourism (if applicable)', expires: true, required: false }
    ],
    insuranceDocs: [
      { type: 'insurance', label: 'Commercial comprehensive insurance (self-drive rental cover)', expires: true, required: true }
    ],
    inspectionChecklist: [
      'Tyres (tread depth ≥ 1.6 mm) and spare wheel',
      'Brakes, steering and suspension',
      'Headlights, indicators and brake lights',
      'Seat belts for every seating position',
      'LPG cylinder, regulator and hose certified / leak tested',
      'Fire extinguisher (in date) and smoke / CO detector',
      'First-aid kit and emergency warning triangle',
      '12V / 230V electrics, inverter and wiring safe',
      'Fresh / grey water tanks clean and leak-free',
      'GPS tracker and roadside-assistance number on board'
    ],
    payout: {
      accountLabel: 'Bank account number',
      routingLabel: 'IFSC code',
      routingPattern: '^[A-Z]{4}0[A-Z0-9]{6}$',
      altLabel: 'UPI ID (optional)'
    }
  }
};

App.ACTIVE_COUNTRY = 'IN';
App.C = App.COUNTRY_PROFILES[App.ACTIVE_COUNTRY];

App.CANCELLATION_POLICIES = {
  flexible: {
    label: 'Flexible',
    summary: 'Full refund up to 2 days before pickup. 50% refund after that.',
    tiers: [{ daysBefore: 2, refund: 1 }, { daysBefore: 0, refund: 0.5 }]
  },
  moderate: {
    label: 'Moderate',
    summary: 'Full refund up to 7 days before pickup, 50% up to 2 days before, no refund after.',
    tiers: [{ daysBefore: 7, refund: 1 }, { daysBefore: 2, refund: 0.5 }, { daysBefore: 0, refund: 0 }]
  },
  strict: {
    label: 'Strict',
    summary: 'Full refund up to 14 days before pickup, 50% up to 7 days before, no refund after.',
    tiers: [{ daysBefore: 14, refund: 1 }, { daysBefore: 7, refund: 0.5 }, { daysBefore: 0, refund: 0 }]
  }
};

App.VAN_TYPES = ['Campervan', 'Motorhome', 'Pop-top', '4x4 Overlander', 'Caravan'];

App.AMENITIES = [
  { id: 'kitchen', label: 'Kitchenette', icon: '🍳' },
  { id: 'fridge', label: 'Fridge', icon: '🧊' },
  { id: 'shower', label: 'Shower', icon: '🚿' },
  { id: 'toilet', label: 'Toilet', icon: '🚽' },
  { id: 'ac', label: 'Air conditioning', icon: '❄️' },
  { id: 'heater', label: 'Heater', icon: '🔥' },
  { id: 'solar', label: 'Solar power', icon: '☀️' },
  { id: 'inverter', label: 'Inverter / 230V', icon: '🔌' },
  { id: 'wifi', label: 'Wi-Fi hotspot', icon: '📶' },
  { id: 'awning', label: 'Awning', icon: '⛺' },
  { id: 'bikerack', label: 'Bike rack', icon: '🚲' },
  { id: 'childseat', label: 'Child seat anchors', icon: '👶' },
  { id: 'pets', label: 'Pet friendly', icon: '🐾' },
  { id: 'gps', label: 'GPS tracker', icon: '📍' },
  { id: 'campingchairs', label: 'Camping chairs & table', icon: '🪑' },
  { id: 'watertank', label: 'Fresh water tank', icon: '💧' }
];

App.VERIFICATION_STATUS = {
  not_started: { label: 'Not started', tone: 'muted', icon: '○' },
  pending: { label: 'Pending', tone: 'warn', icon: '⏳' },
  verified: { label: 'Verified', tone: 'good', icon: '✓' },
  action_required: { label: 'Action required', tone: 'serious', icon: '!' },
  rejected: { label: 'Rejected', tone: 'bad', icon: '✕' }
};
