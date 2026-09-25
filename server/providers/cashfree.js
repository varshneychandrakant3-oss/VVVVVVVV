// Cashfree Secure ID adapter. Endpoints and fields follow Cashfree's
// Verification API v2 reference (https://www.cashfree.com/docs/api-reference/vrs/overview).
// Responses are normalised to the provider-neutral shapes used in verify.js.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { toIsoDate } from '../lib/validate.js';

export class ProviderError extends Error {
  constructor(message, { status = 502, retryable = false, code } = {}) { super(message); this.status = status; this.retryable = retryable; this.code = code; }
}

const base = () => config.cashfree.env === 'production' ? 'https://api.cashfree.com/verification' : 'https://sandbox.cashfree.com/verification';
const vid = (prefix) => `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

async function call(path, body) {
  let res;
  try {
    res = await fetch(base() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-id': config.cashfree.clientId, 'x-client-secret': config.cashfree.clientSecret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
  } catch (e) {
    throw new ProviderError('Verification service is unreachable. Please try again shortly.', { retryable: true, code: 'network' });
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  if (res.status === 400 || res.status === 422) throw new ProviderError(data.message || 'The details could not be checked.', { status: 400, code: data.code });
  if (res.status === 429) throw new ProviderError('Verification service is busy. Please try again in a minute.', { status: 429, retryable: true });
  if (res.status === 401 || res.status === 403) throw new ProviderError('Verification service credentials are invalid or not permitted (check IP whitelisting).', { status: 502, code: 'provider_auth' });
  // 502 = government source down, 5xx = provider issue
  throw new ProviderError('The government source is temporarily unavailable. We’ll review this manually.', { retryable: true, code: data.code || 'source_down' });
}

export const cashfree = {
  name: 'Cashfree Secure ID',

  async verifyPan({ pan, name, dob }) {
    const r = await call('/pan-lite', { verification_id: vid('pan'), pan, name, dob });
    return {
      found: r.status === 'VALID', panStatus: r.pan_status,
      nameMatch: r.name_match === 'Y', dobMatch: r.dob_match === 'Y',
      aadhaarLinked: r.aadhaar_seeding_status === 'Y', ref: r.reference_id
    };
  },

  async verifyGstin({ gstin, businessName }) {
    const r = await call('/gstin', { GSTIN: gstin, ...(businessName ? { business_name: businessName } : {}) });
    return {
      found: r.valid !== false && !!r.legal_name_of_business,
      legalName: r.legal_name_of_business, tradeName: r.trade_name_of_business,
      status: r.gst_in_status, registeredOn: r.date_of_registration, constitution: r.constitution_of_business,
      address: r.principal_place_address, ref: r.reference_id
    };
  },

  async verifyVehicle({ regNo }) {
    const r = await call('/vehicle-rc', { verification_id: vid('rc'), vehicle_number: regNo });
    return {
      found: r.status === 'VALID',
      owner: r.owner, rcStatus: r.rc_status, regDate: toIsoDate(r.reg_date), rcValidUpto: toIsoDate(r.rc_expiry_date),
      maker: r.vehicle_manufacturer_name, model: r.model, makeModel: [r.vehicle_manufacturer_name, r.model].filter(Boolean).join(' '), fuel: r.type, vehicleClass: r.class,
      seats: Number(r.vehicle_seat_capacity) || null, sleeperCapacity: Number(r.vehicle_sleeper_capacity) || null,
      isCommercial: r.is_commercial === true, regAuthority: r.reg_authority, taxUpto: toIsoDate(r.vehicle_tax_upto),
      insurance: { company: r.vehicle_insurance_company_name, policyNumber: r.vehicle_insurance_policy_number, validUpto: toIsoDate(r.vehicle_insurance_upto) },
      puc: { number: r.pucc_number, validUpto: toIsoDate(r.pucc_upto) },
      permit: { type: r.permit_type, number: r.permit_number, validUpto: toIsoDate(r.permit_valid_upto) },
      nationalPermit: { number: r.national_permit_number, validUpto: toIsoDate(r.national_permit_upto) },
      blacklisted: !!r.blacklist_status && !/^(NA|NO|N|NONE)$/i.test(r.blacklist_status),
      financer: r.rc_financer, ref: r.reference_id
    };
  },

  async verifyDrivingLicence({ dlNumber, dob }) {
    const r = await call('/driving-license', { verification_id: vid('dl'), dl_number: dlNumber, dob });
    const v = r.dl_validity || {};
    return {
      found: r.status === 'VALID',
      name: r.details_of_driving_licence?.name,
      validUpto: toIsoDate(v.non_transport?.to), transportValidUpto: toIsoDate(v.transport?.to),
      issuedOn: toIsoDate(r.details_of_driving_licence?.date_of_issue),
      classes: [...new Set((r.badge_details || []).flatMap(b => b.class_of_vehicle || []))], ref: r.reference_id
    };
  },

  async verifyBank({ account, ifsc, name, phone }) {
    const r = await call('/bank-account/sync', { bank_account: account, ifsc, name, ...(phone ? { phone } : {}) });
    return {
      valid: r.account_status === 'VALID', statusCode: r.account_status_code,
      nameAtBank: r.name_at_bank, nameMatchScore: Number(r.name_match_score) || 0, nameMatchResult: r.name_match_result,
      bankName: r.bank_name || r.ifsc_details?.bank, branch: r.branch, ref: r.reference_id
    };
  }
};
