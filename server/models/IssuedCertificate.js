const mongoose = require('mongoose');

const IssuedCertificateSchema = new mongoose.Schema(
  {
    // Reference sa original request o certificate ID
    requestId: {
      type: String,
      required: true,
      index: true
    },
    // Applicant Information
    applicantType: {
      type: String,
      enum: ['Individual', 'Business', 'Resident'],
      default: 'Individual'
    },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    fullName: { type: String, trim: true },
    businessName: { type: String, trim: true },
    ownerName: { type: String, trim: true },
    
    // Certificate Details
    certificateType: {
      type: String,
      required: true // e.g., "Barangay Clearance", "Indigency", "Business Permit"
    },
    purpose: {
      type: String,
      required: true
    },
    remarks: { type: String, default: '' },
    
    // Status Trackers
    status: {
      type: String,
      enum: ['Approved', 'Issued', 'Released'],
      default: 'Issued'
    },
    step: {
      type: Number,
      default: 5 // 5 = Issued / Ready for Reprint
    },
    isIssued: {
      type: Boolean,
      default: true
    },

    // ── ISSUANCE META & BLOTTER VERIFICATION ──
    issuanceMeta: {
      dateIssued: {
        type: Date,
        default: Date.now
      },
      orNumber: {
        type: String,
        required: true,
        trim: true
      },
      amountPaid: {
        type: Number,
        required: true,
        default: 0
      },
      noDerogatoryRecord: {
        type: Boolean,
        default: false
      },
      // CTC (Community Tax Certificate) Info
      ctcNumber: { type: String, trim: true, default: '' },
      ctcAmountPaid: { type: Number, default: 0 },
      ctcDateIssued: { type: Date }
    },

    // Blotter Check Trail
    blotterCheckQuery: { type: String, default: '' },
    blotterMatchesFound: { type: Number, default: 0 },

    // Audit Info
    issuedBy: {
      type: String,
      default: 'Admin Staff' // Pwedeng i-replace ng logged-in user ID/Name
    },
    issuedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true // Awtomatikong nagdadagdag ng createdAt at updatedAt
  }
);

module.exports = mongoose.model('IssuedCertificate', IssuedCertificateSchema);