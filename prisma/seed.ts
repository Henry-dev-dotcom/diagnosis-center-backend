import { hashPassword } from '../src/utils/password.js';

import {
  AppointmentStatus,
  CatalogItemType,
  DeliveryChannel,
  DeliveryStatus,
  DepartmentType,
  EquipmentStatus,
  ExpenseStatus,
  FloatTransactionType,
  GenderRule,
  InvoiceStatus,
  LabResultStatus,
  LabSampleStatus,
  LedgerEntryType,
  NotificationType,
  OrderItemStatus,
  OrderStatus,
  OrderUrgency,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  ReportStatus,
  ResultFlag,
  ScanStatus,
  ShiftStatus,
  UserRole,
  VisitStatus
} from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORDS: Record<string, string> = {
  admin: 'admin123',
  doctor: 'doctor123',
  doctor2: 'doctor123',
  reception: 'reception123',
  lab: 'lab123',
  scan: 'scan123',
  billing: 'billing123'
};

function date(value: string) {
  return new Date(value);
}

function addHours(value: string, hours: number) {
  return new Date(new Date(value).getTime() + hours * 60 * 60 * 1000);
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? fullName,
    lastName: parts.slice(1).join(' ') || 'Unknown'
  };
}

function orderStatusFromLabel(label: string): OrderStatus {
  const map: Record<string, OrderStatus> = {
    Submitted: OrderStatus.SUBMITTED,
    Confirmed: OrderStatus.CONFIRMED,
    'In Progress': OrderStatus.IN_PROGRESS,
    'Pending Review': OrderStatus.PENDING_REVIEW,
    'Final / Released': OrderStatus.FINAL_RELEASED,
    Cancelled: OrderStatus.CANCELLED
  };
  return map[label] ?? OrderStatus.SUBMITTED;
}

function urgencyFromLabel(label: string): OrderUrgency {
  const map: Record<string, OrderUrgency> = {
    Routine: OrderUrgency.ROUTINE,
    Urgent: OrderUrgency.URGENT,
    Critical: OrderUrgency.CRITICAL
  };
  return map[label] ?? OrderUrgency.ROUTINE;
}

function itemStatusFromOrderStatus(status: OrderStatus): OrderItemStatus {
  if (status === OrderStatus.FINAL_RELEASED) return OrderItemStatus.FINAL_RELEASED;
  if (status === OrderStatus.PENDING_REVIEW) return OrderItemStatus.PENDING_REVIEW;
  if (status === OrderStatus.IN_PROGRESS) return OrderItemStatus.ACCEPTED;
  if (status === OrderStatus.CONFIRMED) return OrderItemStatus.REQUESTED;
  if (status === OrderStatus.CANCELLED) return OrderItemStatus.CANCELLED;
  return OrderItemStatus.REQUESTED;
}

function invoiceStatusFromLabel(label: string): InvoiceStatus {
  const map: Record<string, InvoiceStatus> = {
    Pending: InvoiceStatus.UNPAID,
    Unpaid: InvoiceStatus.UNPAID,
    Partial: InvoiceStatus.PARTIAL,
    Paid: InvoiceStatus.PAID,
    'Insurance Pending': InvoiceStatus.INSURANCE_PENDING,
    Refunded: InvoiceStatus.REFUNDED,
    'Written Off': InvoiceStatus.WRITTEN_OFF
  };
  return map[label] ?? InvoiceStatus.UNPAID;
}

function expenseStatusFromLabel(label: string): ExpenseStatus {
  const map: Record<string, ExpenseStatus> = {
    Unpaid: ExpenseStatus.UNPAID,
    Partial: ExpenseStatus.PARTIAL,
    Paid: ExpenseStatus.PAID,
    'Written Off': ExpenseStatus.WRITTEN_OFF
  };
  return map[label] ?? ExpenseStatus.UNPAID;
}

function paymentMethodFromLabel(label: string): PaymentMethod {
  const map: Record<string, PaymentMethod> = {
    Cash: PaymentMethod.CASH,
    'Mobile Money': PaymentMethod.MOBILE_MONEY,
    Card: PaymentMethod.CARD,
    Transfer: PaymentMethod.BANK_TRANSFER,
    'Bank Transfer': PaymentMethod.BANK_TRANSFER,
    Insurance: PaymentMethod.INSURANCE,
    Other: PaymentMethod.OTHER
  };
  return map[label] ?? PaymentMethod.OTHER;
}

function resultFlagFromLabel(label: string): ResultFlag {
  const map: Record<string, ResultFlag> = {
    Pending: ResultFlag.PENDING,
    Normal: ResultFlag.NORMAL,
    Low: ResultFlag.LOW,
    High: ResultFlag.HIGH,
    Critical: ResultFlag.CRITICAL,
    'No Range': ResultFlag.NO_RANGE
  };
  return map[label] ?? ResultFlag.NO_RANGE;
}

function notificationTypeFromTitle(title: string): NotificationType {
  if (title.toLowerCase().includes('result')) return NotificationType.RESULT_RELEASED;
  if (title.toLowerCase().includes('payment')) return NotificationType.PAYMENT_UPDATE;
  if (title.toLowerCase().includes('order')) return NotificationType.ORDER_UPDATE;
  return NotificationType.SYSTEM_ALERT;
}

function channelFromLabel(label: string): DeliveryChannel {
  const map: Record<string, DeliveryChannel> = {
    'In-platform': DeliveryChannel.IN_APP,
    Email: DeliveryChannel.EMAIL,
    SMS: DeliveryChannel.SMS,
    WhatsApp: DeliveryChannel.WHATSAPP,
    Print: DeliveryChannel.PRINT,
    PDF: DeliveryChannel.PDF_DOWNLOAD
  };
  return map[label] ?? DeliveryChannel.IN_APP;
}

function deliveryStatusFromLabel(label: string): DeliveryStatus {
  const map: Record<string, DeliveryStatus> = {
    Queued: DeliveryStatus.QUEUED,
    Delivered: DeliveryStatus.DELIVERED,
    Sent: DeliveryStatus.SENT,
    Failed: DeliveryStatus.FAILED
  };
  return map[label] ?? DeliveryStatus.QUEUED;
}

function normalizeDecimal(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

const catalog = [
  { id: 't1', type: CatalogItemType.LAB, name: 'Full Blood Count (FBC)', departmentCode: 'LAB', modality: null, price: 80, expectedHours: 6, sampleType: 'Blood', aliases: ['FBC', 'CBC', 'Full Blood Count'], parameters: [
    { name: 'WBC', unit: 'x10^9/L', referenceRange: '4.0 - 11.0', low: 4.0, high: 11.0, criticalLow: 2.0, criticalHigh: 20.0 },
    { name: 'RBC', unit: 'x10^12/L', referenceRange: 'Male 4.5 - 6.5 / Female 3.8 - 5.8', low: 3.8, high: 6.5 },
    { name: 'Hemoglobin', unit: 'g/dL', referenceRange: 'Male 13.0 - 17.5 / Female 12.0 - 15.5', low: 12.0, high: 17.5, criticalLow: 7.0, criticalHigh: 20.0 },
    { name: 'Hematocrit', unit: '%', referenceRange: 'Male 38 - 50 / Female 36 - 44', low: 36.0, high: 50.0 },
    { name: 'Platelets', unit: 'x10^9/L', referenceRange: '150 - 400', low: 150, high: 400, criticalLow: 50, criticalHigh: 900 },
    { name: 'MCV', unit: 'fL', referenceRange: '80 - 100', low: 80, high: 100 },
    { name: 'MCH', unit: 'pg', referenceRange: '27 - 33', low: 27, high: 33 }
  ] },
  { id: 't2', type: CatalogItemType.LAB, name: 'Urinalysis', departmentCode: 'LAB', modality: null, price: 50, expectedHours: 4, sampleType: 'Urine', aliases: ['Urine R/E', 'Urine Test', 'Urinalysis'], parameters: [
    { name: 'pH', unit: '', referenceRange: '4.5 - 8.0', low: 4.5, high: 8.0 },
    { name: 'Specific Gravity', unit: '', referenceRange: '1.005 - 1.030', low: 1.005, high: 1.030 }
  ] },
  { id: 't3', type: CatalogItemType.LAB, name: 'Liver Function Test (LFT)', departmentCode: 'LAB', modality: null, price: 120, expectedHours: 8, sampleType: 'Blood', aliases: ['LFT', 'Liver Panel', 'Liver Function'], parameters: [
    { name: 'ALT (SGPT)', unit: 'U/L', referenceRange: '7 - 56', low: 7, high: 56 },
    { name: 'AST (SGOT)', unit: 'U/L', referenceRange: '10 - 40', low: 10, high: 40 },
    { name: 'ALP', unit: 'U/L', referenceRange: '44 - 147', low: 44, high: 147 },
    { name: 'Total Bilirubin', unit: 'mg/dL', referenceRange: '0.1 - 1.2', low: 0.1, high: 1.2 },
    { name: 'Albumin', unit: 'g/dL', referenceRange: '3.5 - 5.5', low: 3.5, high: 5.5 }
  ] },
  { id: 't4', type: CatalogItemType.LAB, name: 'Renal Function Test (RFT)', departmentCode: 'LAB', modality: null, price: 120, expectedHours: 8, sampleType: 'Blood', aliases: ['RFT', 'Kidney Function', 'Renal Panel'], parameters: [
    { name: 'Creatinine', unit: 'mg/dL', referenceRange: 'Male 0.7 - 1.3 / Female 0.6 - 1.1', low: 0.6, high: 1.3 },
    { name: 'BUN/Urea', unit: 'mg/dL', referenceRange: '7 - 20', low: 7, high: 20 },
    { name: 'eGFR', unit: 'mL/min', referenceRange: '90 - 120', low: 90, high: 120 }
  ] },
  { id: 't5', type: CatalogItemType.LAB, name: 'Lipid Profile', departmentCode: 'LAB', modality: null, price: 100, expectedHours: 8, sampleType: 'Blood', aliases: ['Lipids', 'Cholesterol'], parameters: [
    { name: 'Total Cholesterol', unit: 'mg/dL', referenceRange: '< 200', low: 0, high: 200 },
    { name: 'HDL', unit: 'mg/dL', referenceRange: 'Male > 40 / Female > 50', low: 40, high: 200 },
    { name: 'LDL', unit: 'mg/dL', referenceRange: '< 100', low: 0, high: 100 },
    { name: 'Triglycerides', unit: 'mg/dL', referenceRange: '< 150', low: 0, high: 150 }
  ] },
  { id: 't6', type: CatalogItemType.LAB, name: 'Blood Glucose (FBS/RBS)', departmentCode: 'LAB', modality: null, price: 40, expectedHours: 4, sampleType: 'Blood', aliases: ['FBS', 'RBS', 'Glucose', 'Blood Sugar'], parameters: [{ name: 'Blood Glucose', unit: 'mmol/L', referenceRange: '3.9 - 5.6', low: 3.9, high: 5.6, criticalLow: 2.5, criticalHigh: 15.0 }] },
  { id: 't7', type: CatalogItemType.LAB, name: 'Malaria Test (RDT/Film)', departmentCode: 'LAB', modality: null, price: 30, expectedHours: 3, sampleType: 'Blood', aliases: ['Malaria', 'RDT', 'Film'], parameters: [{ name: 'Malaria Parasite', unit: '', referenceRange: 'Negative', low: null, high: null }] },
  { id: 't8', type: CatalogItemType.LAB, name: 'Widal Test', departmentCode: 'LAB', modality: null, price: 60, expectedHours: 4, sampleType: 'Blood', aliases: ['Widal', 'Typhoid'], parameters: [{ name: 'Widal Titre', unit: '', referenceRange: 'Non-significant titre', low: null, high: null }] },
  { id: 't9', type: CatalogItemType.LAB, name: 'Hepatitis B Screening', departmentCode: 'LAB', modality: null, price: 80, expectedHours: 4, sampleType: 'Blood', aliases: ['HBsAg', 'Hepatitis B'], parameters: [{ name: 'HBsAg', unit: '', referenceRange: 'Negative', low: null, high: null }] },
  { id: 't10', type: CatalogItemType.LAB, name: 'HIV Screening', departmentCode: 'LAB', modality: null, price: 60, expectedHours: 4, sampleType: 'Blood', aliases: ['HIV 1/2', 'HIV Screening'], parameters: [{ name: 'HIV 1/2', unit: '', referenceRange: 'Negative', low: null, high: null }] },
  { id: 't11', type: CatalogItemType.LAB, name: 'Semen Analysis', departmentCode: 'LAB', modality: null, price: 100, expectedHours: 10, sampleType: 'Semen', aliases: ['Fertility', 'Semen Analysis'], parameters: [
    { name: 'Volume', unit: 'mL', referenceRange: '1.5 - 6.0', low: 1.5, high: 6.0 },
    { name: 'Sperm Count', unit: 'million/mL', referenceRange: '> 15', low: 15, high: null },
    { name: 'Motility', unit: '%', referenceRange: '> 40', low: 40, high: null }
  ] },
  { id: 't12', type: CatalogItemType.LAB, name: 'Pregnancy Test (HCG)', departmentCode: 'LAB', modality: null, price: 30, expectedHours: 2, sampleType: 'Urine/Serum', aliases: ['Pregnancy', 'HCG'], parameters: [{ name: 'HCG', unit: '', referenceRange: 'Negative / Positive', low: null, high: null }] },
  { id: 't13', type: CatalogItemType.LAB, name: 'Thyroid Function Test', departmentCode: 'LAB', modality: null, price: 150, expectedHours: 12, sampleType: 'Blood', aliases: ['TFT', 'Thyroid', 'TSH', 'T3', 'T4'], parameters: [
    { name: 'TSH', unit: 'mIU/L', referenceRange: '0.4 - 4.0', low: 0.4, high: 4.0 },
    { name: 'Free T4', unit: 'ng/dL', referenceRange: '0.8 - 1.8', low: 0.8, high: 1.8 },
    { name: 'Free T3', unit: 'pg/mL', referenceRange: '2.3 - 4.2', low: 2.3, high: 4.2 }
  ] },
  { id: 't14', type: CatalogItemType.SCAN, name: 'CT Scan - Head', departmentCode: 'IMG', modality: 'CT', price: 800, expectedHours: 18, sampleType: null, aliases: ['Head CT', 'Brain CT'], parameters: [] },
  { id: 't15', type: CatalogItemType.SCAN, name: 'CT Scan - Chest', departmentCode: 'IMG', modality: 'CT', price: 900, expectedHours: 18, sampleType: null, aliases: ['Chest CT'], parameters: [] },
  { id: 't16', type: CatalogItemType.SCAN, name: 'CT Scan - Abdomen', departmentCode: 'IMG', modality: 'CT', price: 1000, expectedHours: 24, sampleType: null, aliases: ['Abdominal CT'], parameters: [] },
  { id: 't17', type: CatalogItemType.SCAN, name: 'X-Ray - Chest', departmentCode: 'IMG', modality: 'X-Ray', price: 150, expectedHours: 12, sampleType: null, aliases: ['CXR', 'Chest Xray'], parameters: [] },
  { id: 't18', type: CatalogItemType.SCAN, name: 'X-Ray - Spine', departmentCode: 'IMG', modality: 'X-Ray', price: 200, expectedHours: 12, sampleType: null, aliases: ['Spine Xray'], parameters: [] },
  { id: 't19', type: CatalogItemType.SCAN, name: 'Ultrasound - Abdomen', departmentCode: 'IMG', modality: 'Ultrasound', price: 250, expectedHours: 24, sampleType: null, aliases: ['Abdominal Ultrasound', 'Abdomen USG'], parameters: [] },
  { id: 't20', type: CatalogItemType.SCAN, name: 'Ultrasound - Pelvic', departmentCode: 'IMG', modality: 'Ultrasound', price: 250, expectedHours: 24, sampleType: null, aliases: ['Pelvic Ultrasound'], parameters: [] },
  { id: 't21', type: CatalogItemType.SCAN, name: 'Ultrasound - Obstetric', departmentCode: 'IMG', modality: 'Ultrasound', price: 300, expectedHours: 24, sampleType: null, aliases: ['OB Ultrasound', 'Pregnancy Scan'], parameters: [] },
  { id: 't22', type: CatalogItemType.SCAN, name: 'Echocardiography', departmentCode: 'IMG', modality: 'Echo', price: 500, expectedHours: 24, sampleType: null, aliases: ['Echo', 'Cardiac Ultrasound'], parameters: [] }
];

const orders = [
  { id: 'ORD-2026-0001', patientId: 'PAT-0001', doctorId: 'DOC-001', hospitalId: 'HOSP-001', itemIds: ['t1', 't6'], urgency: 'Routine', clinicalNotes: 'Fever and fatigue. Rule out infection and glucose abnormality.', status: 'Submitted', createdAt: '2026-06-17T10:15:00Z', updatedAt: '2026-06-17T10:15:00Z' },
  { id: 'ORD-2026-0002', patientId: 'PAT-0002', doctorId: 'DOC-001', hospitalId: 'HOSP-001', itemIds: ['t17'], urgency: 'Urgent', clinicalNotes: 'Persistent cough, urgent chest imaging requested.', status: 'Confirmed', createdAt: '2026-06-17T11:30:00Z', updatedAt: '2026-06-17T11:45:00Z' },
  { id: 'ORD-2026-0003', patientId: 'PAT-0003', doctorId: 'DOC-002', hospitalId: 'HOSP-002', itemIds: ['t3', 't19'], urgency: 'Routine', clinicalNotes: 'Abdominal discomfort and jaundice history. Request LFT and ultrasound.', status: 'Pending Review', createdAt: '2026-06-17T07:45:00Z', updatedAt: '2026-06-17T12:20:00Z' },
  { id: 'ORD-2026-0004', patientId: 'PAT-0001', doctorId: 'DOC-001', hospitalId: 'HOSP-001', itemIds: ['t1'], urgency: 'Routine', clinicalNotes: 'Follow-up CBC after treatment. Release result to referring doctor.', status: 'Final / Released', createdAt: '2026-06-16T13:00:00Z', updatedAt: '2026-06-16T18:30:00Z' },
  { id: 'ORD-2026-0005', patientId: 'PAT-0001', doctorId: 'DOC-001', hospitalId: 'HOSP-001', itemIds: ['t1'], urgency: 'Routine', clinicalNotes: 'Earlier CBC baseline for progress trend.', status: 'Final / Released', createdAt: '2026-05-22T09:00:00Z', updatedAt: '2026-05-22T14:10:00Z' },
  { id: 'ORD-2026-0006', patientId: 'PAT-0001', doctorId: 'DOC-001', hospitalId: 'HOSP-001', itemIds: ['t1'], urgency: 'Routine', clinicalNotes: 'Second CBC follow-up for line chart progress.', status: 'Final / Released', createdAt: '2026-06-03T10:00:00Z', updatedAt: '2026-06-03T15:30:00Z' }
];

const orderTimelines: Record<string, Array<{ status: string; actor?: string; timestamp: string }>> = {
  'ORD-2026-0001': [{ status: 'Submitted', actor: 'Dr. Abena Mensah', timestamp: '2026-06-17T10:15:00Z' }],
  'ORD-2026-0002': [
    { status: 'Submitted', actor: 'Dr. Abena Mensah', timestamp: '2026-06-17T11:30:00Z' },
    { status: 'Confirmed', actor: 'Grace Osei', timestamp: '2026-06-17T11:45:00Z' }
  ],
  'ORD-2026-0003': [
    { status: 'Submitted', actor: 'Dr. Michael Nortey', timestamp: '2026-06-17T07:45:00Z' },
    { status: 'Confirmed', actor: 'Grace Osei', timestamp: '2026-06-17T08:10:00Z' },
    { status: 'In Progress', actor: 'Kwame Adu', timestamp: '2026-06-17T09:05:00Z' },
    { status: 'Pending Review', actor: 'Ama Boateng', timestamp: '2026-06-17T12:20:00Z' }
  ],
  'ORD-2026-0004': [
    { status: 'Submitted', actor: 'Dr. Abena Mensah', timestamp: '2026-06-16T13:00:00Z' },
    { status: 'Confirmed', actor: 'Grace Osei', timestamp: '2026-06-16T13:20:00Z' },
    { status: 'In Progress', actor: 'Kwame Adu', timestamp: '2026-06-16T14:00:00Z' },
    { status: 'Pending Review', actor: 'Senior Lab Tech', timestamp: '2026-06-16T17:40:00Z' },
    { status: 'Final / Released', actor: 'Dr. Pathologist', timestamp: '2026-06-16T18:30:00Z' }
  ],
  'ORD-2026-0005': [
    { status: 'Submitted', actor: 'Dr. Abena Mensah', timestamp: '2026-05-22T09:00:00Z' },
    { status: 'Final / Released', actor: 'Dr. Pathologist', timestamp: '2026-05-22T14:10:00Z' }
  ],
  'ORD-2026-0006': [
    { status: 'Submitted', actor: 'Dr. Abena Mensah', timestamp: '2026-06-03T10:00:00Z' },
    { status: 'Final / Released', actor: 'Dr. Pathologist', timestamp: '2026-06-03T15:30:00Z' }
  ]
};

const labResults = [
  { id: 'RES-0003', orderId: 'ORD-2026-0004', orderItemId: 'OITEM-ORD-2026-0004-t1', sampleId: 'SMP-0004', patientId: 'PAT-0001', status: 'Final / Released', reportText: 'CBC largely stable. Mild thrombocytosis; correlate clinically.', createdAt: '2026-06-16T17:40:00Z', approvedAt: '2026-06-16T18:30:00Z', parameters: [
    { testId: 't1', name: 'Hemoglobin', value: '13.4', unit: 'g/dL', referenceRange: 'Male 13.0 - 17.5 / Female 12.0 - 15.5', flag: 'Normal' },
    { testId: 't1', name: 'WBC', value: '10.8', unit: 'x10^9/L', referenceRange: '4.0 - 11.0', flag: 'Normal' },
    { testId: 't1', name: 'Platelets', value: '471', unit: 'x10^9/L', referenceRange: '150 - 400', flag: 'High' }
  ] },
  { id: 'RES-0005', orderId: 'ORD-2026-0005', orderItemId: 'OITEM-ORD-2026-0005-t1', sampleId: 'SMP-0005', patientId: 'PAT-0001', status: 'Final / Released', reportText: 'Baseline CBC before treatment. Leukocytosis noted.', createdAt: '2026-05-22T13:50:00Z', approvedAt: '2026-05-22T14:10:00Z', parameters: [
    { testId: 't1', name: 'Hemoglobin', value: '12.1', unit: 'g/dL', referenceRange: 'Male 13.0 - 17.5 / Female 12.0 - 15.5', low: 12, high: 17.5, flag: 'Normal' },
    { testId: 't1', name: 'WBC', value: '15.2', unit: 'x10^9/L', referenceRange: '4.0 - 11.0', low: 4, high: 11, flag: 'High' },
    { testId: 't1', name: 'Platelets', value: '388', unit: 'x10^9/L', referenceRange: '150 - 400', low: 150, high: 400, flag: 'Normal' }
  ] },
  { id: 'RES-0006', orderId: 'ORD-2026-0006', orderItemId: 'OITEM-ORD-2026-0006-t1', sampleId: 'SMP-0006', patientId: 'PAT-0001', status: 'Final / Released', reportText: 'Second CBC follow-up. WBC improving; platelets mildly elevated.', createdAt: '2026-06-03T15:10:00Z', approvedAt: '2026-06-03T15:30:00Z', parameters: [
    { testId: 't1', name: 'Hemoglobin', value: '12.8', unit: 'g/dL', referenceRange: 'Male 13.0 - 17.5 / Female 12.0 - 15.5', low: 12, high: 17.5, flag: 'Normal' },
    { testId: 't1', name: 'WBC', value: '12.4', unit: 'x10^9/L', referenceRange: '4.0 - 11.0', low: 4, high: 11, flag: 'High' },
    { testId: 't1', name: 'Platelets', value: '425', unit: 'x10^9/L', referenceRange: '150 - 400', low: 150, high: 400, flag: 'High' }
  ] },
  { id: 'RES-0001', orderId: 'ORD-2026-0003', orderItemId: 'OITEM-ORD-2026-0003-t3', sampleId: 'SMP-0001', patientId: 'PAT-0003', status: 'Pending Review', reportText: 'Elevated ALT and bilirubin. Correlate clinically.', createdAt: '2026-06-17T12:10:00Z', approvedAt: null, parameters: [
    { testId: 't3', name: 'ALT (SGPT)', value: '72', unit: 'U/L', referenceRange: '7 - 56', flag: 'High' },
    { testId: 't3', name: 'AST (SGOT)', value: '38', unit: 'U/L', referenceRange: '10 - 40', flag: 'Normal' },
    { testId: 't3', name: 'Total Bilirubin', value: '1.6', unit: 'mg/dL', referenceRange: '0.1 - 1.2', flag: 'High' }
  ] }
];

const invoices = [
  { id: 'INV-0004', orderId: 'ORD-2026-0004', amount: 80, status: 'Paid', method: 'Card', createdAt: '2026-06-16T13:30:00Z', transactions: [{ id: 'TXN-0002', amount: 80, method: 'Card', createdAt: '2026-06-16T13:30:00Z' }] },
  { id: 'INV-0005', orderId: 'ORD-2026-0005', amount: 80, status: 'Paid', method: 'Cash', createdAt: '2026-05-22T09:10:00Z', transactions: [{ id: 'TXN-0005', amount: 80, method: 'Cash', createdAt: '2026-05-22T09:10:00Z' }] },
  { id: 'INV-0006', orderId: 'ORD-2026-0006', amount: 80, status: 'Paid', method: 'Mobile Money', createdAt: '2026-06-03T10:10:00Z', transactions: [{ id: 'TXN-0006', amount: 80, method: 'Mobile Money', createdAt: '2026-06-03T10:10:00Z' }] },
  { id: 'INV-0001', orderId: 'ORD-2026-0001', amount: 120, status: 'Pending', method: '', createdAt: '2026-06-17T10:18:00Z', transactions: [] },
  { id: 'INV-0002', orderId: 'ORD-2026-0002', amount: 150, status: 'Paid', method: 'Transfer', createdAt: '2026-06-17T11:40:00Z', transactions: [{ id: 'TXN-0001', amount: 150, method: 'Transfer', createdAt: '2026-06-17T11:40:00Z' }] },
  { id: 'INV-0003', orderId: 'ORD-2026-0003', amount: 370, status: 'Insurance Pending', method: 'Insurance', insuranceReference: 'CC-CLAIM-001', createdAt: '2026-06-17T08:20:00Z', transactions: [] }
];

const expenses = [
  { id: 'EXP-0001', description: 'CBC reagent purchase', category: 'Purchase Cost', amount: 650, amountPaid: 650, method: 'Bank Transfer', vendor: 'Sysmex GH', reference: 'RCPT-2201', status: 'Paid', createdAt: '2026-06-12T09:10:00Z', payments: [{ id: 'EXPPAY-0001', amount: 650, method: 'Bank Transfer', createdAt: '2026-06-12T09:10:00Z' }] },
  { id: 'EXP-0002', description: 'Courier fees for external samples', category: 'Courier Fees', amount: 180, amountPaid: 80, method: 'Cash', vendor: 'QuickRun Courier', reference: 'CR-904', status: 'Partial', createdAt: '2026-06-15T15:40:00Z', payments: [{ id: 'EXPPAY-0002', amount: 80, method: 'Cash', createdAt: '2026-06-15T15:40:00Z' }] },
  { id: 'EXP-0003', description: 'Software subscription arrears', category: 'Subscription', amount: 240, amountPaid: 0, method: 'Card', vendor: 'Cloud Diagnostics', reference: '', status: 'Unpaid', createdAt: '2026-06-16T12:15:00Z', payments: [] },
  { id: 'EXP-0004', description: 'Expired consumables written off', category: 'Other', amount: 95, amountPaid: 0, method: 'Cash', vendor: 'Internal', reference: '', status: 'Written Off', writeOffReason: 'Expired stock disposal', createdAt: '2026-06-10T10:00:00Z', payments: [] }
];

const notifications = [
  { id: 'NOT-001', title: 'Incoming doctor order', body: 'ORD-2026-0001 is awaiting reception confirmation.', audienceUserId: 'USR-002', channel: 'In-platform', status: 'Delivered', read: false, createdAt: '2026-06-17T10:15:00Z', entityId: 'ORD-2026-0001' },
  { id: 'NOT-002', title: 'Review required', body: 'ORD-2026-0003 has results awaiting sign-off.', audienceUserId: 'USR-006', channel: 'In-platform', status: 'Delivered', read: false, createdAt: '2026-06-17T12:20:00Z', entityId: 'ORD-2026-0003' },
  { id: 'NOT-003', title: 'Result released', body: 'ORD-2026-0004 has been finalized. Log in to view the report.', audienceUserId: 'USR-001', channel: 'In-platform', status: 'Delivered', read: false, createdAt: '2026-06-16T18:31:00Z', deliveredAt: '2026-06-16T18:31:00Z', entityId: 'ORD-2026-0004' },
  { id: 'NOT-004', title: 'Email result notification queued', body: 'Result ORD-2026-0004 is ready. Log in to view the finalized report.', audienceUserId: 'USR-001', channel: 'Email', status: 'Delivered', target: 'abena.mensah@straphael.example', read: false, createdAt: '2026-06-16T18:31:00Z', deliveredAt: '2026-06-16T18:32:00Z', entityId: 'ORD-2026-0004' },
  { id: 'NOT-005', title: 'SMS result alert queued', body: 'A diagnosis center result is ready for order ORD-2026-0004. Please log in to view the finalized report.', audienceUserId: 'USR-001', channel: 'SMS', status: 'Queued', target: '+233 24 555 0101', read: false, createdAt: '2026-06-16T18:31:00Z', deliveredAt: null, entityId: 'ORD-2026-0004' }
];

async function resetDemoData() {
  await prisma.$transaction([
    prisma.apiRequestLog.deleteMany(),
    prisma.systemEvent.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.secureResultLink.deleteMany(),
    prisma.deliveryLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.report.deleteMany(),
    prisma.receipt.deleteMany(),
    prisma.ledgerEntry.deleteMany(),
    prisma.expensePayment.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.floatTransaction.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.cashierShift.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.scanRetake.deleteMany(),
    prisma.scanReview.deleteMany(),
    prisma.scanResultFile.deleteMany(),
    prisma.scanResult.deleteMany(),
    prisma.scanBooking.deleteMany(),
    prisma.scanAcceptance.deleteMany(),
    prisma.inventoryTransaction.deleteMany(),
    prisma.inventoryItem.deleteMany(),
    prisma.qualityControlRun.deleteMany(),
    prisma.sampleRejection.deleteMany(),
    prisma.labResultAmendment.deleteMany(),
    prisma.labResultReview.deleteMany(),
    prisma.labResultParameter.deleteMany(),
    prisma.labResult.deleteMany(),
    prisma.labSample.deleteMany(),
    prisma.patientVisit.deleteMany(),
    prisma.appointment.deleteMany(),
    prisma.orderCancellation.deleteMany(),
    prisma.orderStatusHistory.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.referenceRange.deleteMany(),
    prisma.referenceParameter.deleteMany(),
    prisma.catalogItem.deleteMany(),
    prisma.equipment.deleteMany(),
    prisma.department.deleteMany(),
    prisma.patientDuplicateFlag.deleteMany(),
    prisma.patientInsurance.deleteMany(),
    prisma.patientContact.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.doctorProfile.deleteMany(),
    prisma.passwordResetToken.deleteMany(),
    prisma.userSession.deleteMany(),
    prisma.user.deleteMany(),
    prisma.hospital.deleteMany()
  ]);
}

async function seedUsersAndDoctors() {
  const users = [
    { id: 'USR-006', username: 'admin', name: 'System Admin', email: 'admin@sunkwa.local', role: UserRole.ADMIN },
    { id: 'USR-001', username: 'doctor', name: 'Dr. Abena Mensah', email: 'doctor@sunkwa.local', role: UserRole.DOCTOR },
    { id: 'USR-007', username: 'doctor2', name: 'Dr. Michael Nortey', email: 'doctor2@sunkwa.local', role: UserRole.DOCTOR },
    { id: 'USR-002', username: 'reception', name: 'Grace Osei', email: 'reception@sunkwa.local', role: UserRole.RECEPTIONIST },
    { id: 'USR-003', username: 'lab', name: 'Kwame Adu', email: 'lab@sunkwa.local', role: UserRole.LAB_STAFF },
    { id: 'USR-004', username: 'scan', name: 'Ama Boateng', email: 'scan@sunkwa.local', role: UserRole.SCAN_STAFF },
    { id: 'USR-005', username: 'billing', name: 'Kofi Danquah', email: 'billing@sunkwa.local', role: UserRole.BILLING_STAFF }
  ];

  for (const user of users) {
    await prisma.user.create({
      data: {
        ...user,
        passwordHash: await hashPassword(DEMO_PASSWORDS[user.username] ?? 'Password123')
      }
    });
  }

  await prisma.hospital.createMany({
    data: [
      { id: 'HOSP-001', code: 'HOSP-001', name: 'St. Raphael Hospital', billingContact: 'accounts@straphael.example', accountStatus: 'Active', phone: '+233 20 000 1001', address: 'Airport Residential Area, Accra', email: 'info@straphael.example' },
      { id: 'HOSP-002', code: 'HOSP-002', name: 'North Ridge Medical Centre', billingContact: 'finance@northridge.example', accountStatus: 'Active', phone: '+233 20 000 1002', address: 'North Ridge, Accra', email: 'info@northridge.example' }
    ]
  });

  await prisma.doctorProfile.createMany({
    data: [
      { id: 'DOC-001', userId: 'USR-001', hospitalId: 'HOSP-001', title: 'Dr.', specialty: 'Internal Medicine', licenseNumber: 'MDC/RN/2024/18492', email: 'abena.mensah@straphael.example', phone: '+233 24 555 0101', notificationEmail: true, notificationSms: true },
      { id: 'DOC-002', userId: 'USR-007', hospitalId: 'HOSP-002', title: 'Dr.', specialty: 'Gastroenterology', licenseNumber: 'MDC/RN/2023/11002', email: 'michael.nortey@northridge.example', phone: '+233 24 555 0102', notificationEmail: true, notificationSms: false }
    ]
  });
}

async function seedDepartmentsAndEquipment() {
  await prisma.department.createMany({
    data: [
      { id: 'DEP-001', code: 'REC', name: 'Reception', type: DepartmentType.RECEPTION, leadName: 'Grace Osei' },
      { id: 'DEP-002', code: 'LAB', name: 'Laboratory', type: DepartmentType.LABORATORY, leadName: 'Kwame Adu' },
      { id: 'DEP-003', code: 'IMG', name: 'Imaging', type: DepartmentType.IMAGING, leadName: 'Ama Boateng' },
      { id: 'DEP-004', code: 'FIN', name: 'Billing', type: DepartmentType.BILLING_FINANCE, leadName: 'Kofi Danquah' },
      { id: 'DEP-005', code: 'ADM', name: 'Administration', type: DepartmentType.ADMIN, leadName: 'System Admin' }
    ]
  });

  await prisma.equipment.createMany({
    data: [
      { id: 'EQ-XR-01', departmentId: 'DEP-003', room: 'X-Ray Room 1', name: 'Digital X-Ray DRX-1', modality: 'X-Ray', serialNumber: 'EQ-XR-01', status: EquipmentStatus.AVAILABLE },
      { id: 'EQ-US-01', departmentId: 'DEP-003', room: 'Ultrasound Room', name: 'SonoAce X8', modality: 'Ultrasound', serialNumber: 'EQ-US-01', status: EquipmentStatus.AVAILABLE },
      { id: 'EQ-CT-01', departmentId: 'DEP-003', room: 'CT Suite', name: 'Somatom Go.Now', modality: 'CT', serialNumber: 'EQ-CT-01', status: EquipmentStatus.IN_USE },
      { id: 'EQ-MR-01', departmentId: 'DEP-003', room: 'MRI Suite', name: 'Magnetom 1.5T', modality: 'MRI', serialNumber: 'EQ-MR-01', status: EquipmentStatus.MAINTENANCE },
      { id: 'EQ-LAB-CBC-01', departmentId: 'DEP-002', room: 'Lab Bench 1', name: 'Sysmex XN-550', modality: 'Analyzer', serialNumber: 'EQ-LAB-CBC-01', status: EquipmentStatus.AVAILABLE },
      { id: 'EQ-LAB-CHEM-01', departmentId: 'DEP-002', room: 'Chemistry Bench', name: 'Cobas c111', modality: 'Analyzer', serialNumber: 'EQ-LAB-CHEM-01', status: EquipmentStatus.AVAILABLE }
    ]
  });
}

async function seedPatients() {
  const patients = [
    { id: 'PAT-0001', fullName: 'Ama Serwaa Boateng', dateOfBirth: '1988-04-11', gender: 'Female', phone: '+233 24 111 2233', email: 'ama.serwaa@example.com', address: 'East Legon, Accra', nationalId: 'GHA-123456789-0', referringHospitalId: 'HOSP-001', referringDoctorId: 'DOC-001', insuranceProvider: 'Premier Health', policyNumber: 'PH-49201', emergencyContact: 'Yaw Boateng — +233 24 998 8877', allergies: 'No known drug allergies', createdAt: '2026-06-17T08:00:00Z' },
    { id: 'PAT-0002', fullName: 'Kojo Nyarko', dateOfBirth: '1979-09-22', gender: 'Male', phone: '+233 20 333 4455', email: 'kojo.nyarko@example.com', address: 'Osu, Accra', nationalId: 'GHA-992233111-2', referringHospitalId: 'HOSP-001', referringDoctorId: 'DOC-001', insuranceProvider: '', policyNumber: '', emergencyContact: 'Akua Nyarko — +233 20 222 1133', allergies: 'Hypertension history', createdAt: '2026-06-17T09:00:00Z' },
    { id: 'PAT-0003', fullName: 'Nana Yaa Prempeh', dateOfBirth: '1994-01-05', gender: 'Female', phone: '+233 26 777 8899', email: 'nana.prempeh@example.com', address: 'Adenta, Accra', nationalId: 'GHA-202222333-4', referringHospitalId: 'HOSP-002', referringDoctorId: 'DOC-002', insuranceProvider: 'CorporateCare', policyNumber: 'CC-7822', emergencyContact: 'Kwaku Prempeh — +233 26 888 9900', allergies: 'Penicillin allergy', createdAt: '2026-06-17T07:30:00Z' }
  ];

  for (const patient of patients) {
    const name = splitName(patient.fullName);
    await prisma.patient.create({
      data: {
        id: patient.id,
        patientCode: patient.id,
        firstName: name.firstName,
        lastName: name.lastName,
        dateOfBirth: date(`${patient.dateOfBirth}T00:00:00Z`),
        gender: patient.gender,
        phone: patient.phone,
        email: patient.email,
        address: patient.address,
        nationalId: patient.nationalId,
        insuranceProvider: patient.insuranceProvider || undefined,
        policyNumber: patient.policyNumber || undefined,
        emergencyContact: patient.emergencyContact,
        allergiesAndConditions: patient.allergies,
        hospitalId: patient.referringHospitalId,
        referringDoctorId: patient.referringDoctorId,
        createdById: 'USR-002',
        updatedById: 'USR-002',
        createdAt: date(patient.createdAt)
      }
    });

    if (patient.phone) {
      await prisma.patientContact.create({ data: { patientId: patient.id, type: 'phone', value: patient.phone, isPrimary: true } });
    }
    if (patient.email) {
      await prisma.patientContact.create({ data: { patientId: patient.id, type: 'email', value: patient.email, isPrimary: true } });
    }
    if (patient.insuranceProvider && patient.policyNumber) {
      await prisma.patientInsurance.create({ data: { patientId: patient.id, provider: patient.insuranceProvider, policyNumber: patient.policyNumber } });
    }
  }
}

async function seedCatalogAndReferenceRanges() {
  for (const item of catalog) {
    await prisma.catalogItem.create({
      data: {
        id: item.id,
        catalogCode: item.id,
        name: item.name,
        type: item.type,
        departmentId: item.departmentCode === 'LAB' ? 'DEP-002' : 'DEP-003',
        price: String(item.price),
        expectedCompletionHours: item.expectedHours,
        sampleType: item.sampleType,
        modality: item.modality,
        aliases: item.aliases
      }
    });

    for (let index = 0; index < item.parameters.length; index += 1) {
      const parameter = item.parameters[index];
      const parameterId = `PARAM-${item.id}-${index + 1}`;
      await prisma.referenceParameter.create({
        data: {
          id: parameterId,
          catalogItemId: item.id,
          name: parameter.name,
          unit: parameter.unit,
          sortOrder: index + 1
        }
      });

      await prisma.referenceRange.create({
        data: {
          id: `RANGE-${item.id}-${index + 1}`,
          parameterId,
          gender: GenderRule.ALL,
          ageMin: 0,
          ageMax: 200,
          low: normalizeDecimal(parameter.low),
          high: normalizeDecimal(parameter.high),
          criticalLow: normalizeDecimal('criticalLow' in parameter ? parameter.criticalLow : undefined),
          criticalHigh: normalizeDecimal('criticalHigh' in parameter ? parameter.criticalHigh : undefined),
          displayRange: parameter.referenceRange
        }
      });
    }
  }
}

async function seedOrders() {
  for (const order of orders) {
    const status = orderStatusFromLabel(order.status);
    const maxHours = Math.max(...order.itemIds.map((itemId) => catalog.find((item) => item.id === itemId)?.expectedHours ?? 24));
    await prisma.order.create({
      data: {
        id: order.id,
        orderCode: order.id,
        patientId: order.patientId,
        doctorId: order.doctorId,
        hospitalId: order.hospitalId,
        status,
        urgency: urgencyFromLabel(order.urgency),
        clinicalNotes: order.clinicalNotes,
        expectedCompletionAt: addHours(order.createdAt, maxHours),
        submittedAt: date(order.createdAt),
        confirmedAt: status !== OrderStatus.SUBMITTED ? date(order.updatedAt) : undefined,
        releasedAt: status === OrderStatus.FINAL_RELEASED ? date(order.updatedAt) : undefined,
        createdById: order.doctorId === 'DOC-002' ? 'USR-007' : 'USR-001',
        confirmedById: status !== OrderStatus.SUBMITTED ? 'USR-002' : undefined,
        createdAt: date(order.createdAt),
        updatedAt: date(order.updatedAt)
      }
    });

    for (const itemId of order.itemIds) {
      const catalogItem = catalog.find((item) => item.id === itemId);
      if (!catalogItem) continue;
      await prisma.orderItem.create({
        data: {
          id: `OITEM-${order.id}-${itemId}`,
          orderId: order.id,
          catalogItemId: itemId,
          type: catalogItem.type,
          status: itemStatusFromOrderStatus(status),
          expectedCompletionAt: addHours(order.createdAt, catalogItem.expectedHours),
          acceptedAt: [OrderStatus.IN_PROGRESS, OrderStatus.PENDING_REVIEW, OrderStatus.FINAL_RELEASED].includes(status) ? date(order.updatedAt) : undefined,
          completedAt: status === OrderStatus.FINAL_RELEASED ? date(order.updatedAt) : undefined,
          createdAt: date(order.createdAt),
          updatedAt: date(order.updatedAt)
        }
      });
    }

    const timeline = orderTimelines[order.id] ?? [];
    let previousStatus: OrderStatus | undefined;
    for (let index = 0; index < timeline.length; index += 1) {
      const entry = timeline[index];
      const toStatus = orderStatusFromLabel(entry.status);
      const actorId = entry.actor === 'Dr. Abena Mensah' ? 'USR-001' : entry.actor === 'Dr. Michael Nortey' ? 'USR-007' : entry.actor === 'Grace Osei' ? 'USR-002' : entry.actor === 'Kwame Adu' ? 'USR-003' : entry.actor === 'Ama Boateng' ? 'USR-004' : undefined;
      await prisma.orderStatusHistory.create({
        data: {
          id: `OSH-${order.id}-${index + 1}`,
          orderId: order.id,
          fromStatus: previousStatus,
          toStatus,
          actorId,
          note: entry.actor ? `Seed timeline event by ${entry.actor}` : 'Seed timeline event',
          createdAt: date(entry.timestamp)
        }
      });
      previousStatus = toStatus;
    }
  }
}

async function seedReceptionWorkflow() {
  await prisma.appointment.create({
    data: {
      id: 'APT-0001',
      appointmentCode: 'APT-0001',
      patientId: 'PAT-0002',
      orderId: 'ORD-2026-0002',
      doctorId: 'DOC-001',
      hospitalId: 'HOSP-001',
      scheduledDate: date('2026-06-17T14:00:00Z'),
      type: 'Chest X-ray visit',
      roomOrArea: 'X-Ray Room 1',
      status: AppointmentStatus.SCHEDULED,
      notes: 'Urgent imaging slot.',
      createdAt: date('2026-06-17T11:50:00Z')
    }
  });

  await prisma.patientVisit.create({
    data: {
      id: 'VIS-0001',
      visitCode: 'VIS-0001',
      patientId: 'PAT-0003',
      orderId: 'ORD-2026-0003',
      checkedInById: 'USR-002',
      identityVerified: true,
      status: VisitStatus.CHECKED_IN,
      visitType: 'Insurance Visit',
      checkedInAt: date('2026-06-17T08:30:00Z'),
      notes: 'Insurance details verified.'
    }
  });
}

async function seedLabAndScanWorkflow() {
  const sampleData = [
    { id: 'SMP-0001', orderItemId: 'OITEM-ORD-2026-0003-t3', patientId: 'PAT-0003', status: LabSampleStatus.PENDING_REVIEW, sampleType: 'Blood', collectedAt: '2026-06-17T08:55:00Z', acceptedAt: '2026-06-17T09:05:00Z' },
    { id: 'SMP-0004', orderItemId: 'OITEM-ORD-2026-0004-t1', patientId: 'PAT-0001', status: LabSampleStatus.SIGNED_OFF, sampleType: 'Blood', collectedAt: '2026-06-16T13:45:00Z', acceptedAt: '2026-06-16T14:00:00Z' },
    { id: 'SMP-0005', orderItemId: 'OITEM-ORD-2026-0005-t1', patientId: 'PAT-0001', status: LabSampleStatus.SIGNED_OFF, sampleType: 'Blood', collectedAt: '2026-05-22T09:20:00Z', acceptedAt: '2026-05-22T09:30:00Z' },
    { id: 'SMP-0006', orderItemId: 'OITEM-ORD-2026-0006-t1', patientId: 'PAT-0001', status: LabSampleStatus.SIGNED_OFF, sampleType: 'Blood', collectedAt: '2026-06-03T10:20:00Z', acceptedAt: '2026-06-03T10:30:00Z' }
  ];

  for (const sample of sampleData) {
    await prisma.labSample.create({
      data: {
        id: sample.id,
        sampleCode: sample.id,
        orderItemId: sample.orderItemId,
        patientId: sample.patientId,
        status: sample.status,
        sampleType: sample.sampleType,
        collectedAt: date(sample.collectedAt),
        acceptedAt: date(sample.acceptedAt),
        acceptedById: 'USR-003',
        barcodeValue: `${sample.id}-BARCODE`,
        notes: 'Seeded frontend-compatible lab sample.'
      }
    });
  }

  for (const result of labResults) {
    const isFinal = result.status === 'Final / Released';
    await prisma.labResult.create({
      data: {
        id: result.id,
        resultCode: result.id,
        orderItemId: result.orderItemId,
        sampleId: result.sampleId,
        patientId: result.patientId,
        status: isFinal ? LabResultStatus.SIGNED_OFF : LabResultStatus.PENDING_REVIEW,
        interpretation: result.reportText,
        technicianNotes: 'Seeded result from frontend demo dataset.',
        analyzerUsed: result.orderItemId.includes('t3') ? 'Cobas c111' : 'Sysmex XN-550',
        enteredById: 'USR-003',
        submittedAt: date(result.createdAt),
        signedOffAt: result.approvedAt ? date(result.approvedAt) : undefined,
        createdAt: date(result.createdAt)
      }
    });

    for (let index = 0; index < result.parameters.length; index += 1) {
      const parameter = result.parameters[index];
      const referenceParameter = await prisma.referenceParameter.findFirst({ where: { catalogItemId: parameter.testId, name: parameter.name } });
      const range = referenceParameter ? await prisma.referenceRange.findFirst({ where: { parameterId: referenceParameter.id } }) : null;
      await prisma.labResultParameter.create({
        data: {
          id: `LRP-${result.id}-${index + 1}`,
          labResultId: result.id,
          referenceParameterId: referenceParameter?.id,
          name: parameter.name,
          value: parameter.value,
          numericValue: normalizeDecimal(parameter.value),
          unit: parameter.unit,
          referenceRange: parameter.referenceRange,
          low: normalizeDecimal('low' in parameter ? parameter.low : range?.low?.toString()),
          high: normalizeDecimal('high' in parameter ? parameter.high : range?.high?.toString()),
          criticalLow: normalizeDecimal(range?.criticalLow?.toString()),
          criticalHigh: normalizeDecimal(range?.criticalHigh?.toString()),
          flag: resultFlagFromLabel(parameter.flag)
        }
      });
    }

    await prisma.labResultReview.create({
      data: {
        id: `LREV-${result.id}`,
        labResultId: result.id,
        reviewerId: isFinal ? 'USR-003' : undefined,
        decision: isFinal ? 'SIGNED_OFF' : 'PENDING_REVIEW',
        note: isFinal ? 'Seeded signed-off result.' : 'Seeded result awaiting senior review.',
        createdAt: result.approvedAt ? date(result.approvedAt) : date(result.createdAt)
      }
    });
  }

  await prisma.scanAcceptance.create({
    data: {
      id: 'SCANACC-0001',
      orderItemId: 'OITEM-ORD-2026-0003-t19',
      status: ScanStatus.PENDING_REVIEW,
      acceptedById: 'USR-004',
      acceptedAt: date('2026-06-17T10:30:00Z'),
      notes: 'Patient prepared and scanned without complication.'
    }
  });

  await prisma.scanBooking.create({
    data: {
      id: 'BOOK-0001',
      bookingCode: 'BOOK-0001',
      patientId: 'PAT-0003',
      orderItemId: 'OITEM-ORD-2026-0003-t19',
      equipmentId: 'EQ-US-01',
      startAt: date('2026-06-17T10:30:00Z'),
      endAt: date('2026-06-17T11:00:00Z'),
      status: 'Accepted',
      notes: 'Accepted imaging slot from frontend seed data.',
      createdById: 'USR-004'
    }
  });

  await prisma.scanResult.create({
    data: {
      id: 'SCAN-RES-0002',
      resultCode: 'RES-0002',
      orderItemId: 'OITEM-ORD-2026-0003-t19',
      acceptanceId: 'SCANACC-0001',
      status: ScanStatus.PENDING_REVIEW,
      findings: 'Abdominal ultrasound shows mild fatty infiltration. No focal lesion seen.',
      impression: 'Mild fatty liver change. No focal hepatic lesion.',
      recommendations: 'Correlate with LFT and clinical symptoms.',
      technicianNotes: 'Seeded imaging report awaiting sign-off.',
      reportedById: 'USR-004',
      submittedAt: date('2026-06-17T12:20:00Z'),
      createdAt: date('2026-06-17T12:20:00Z')
    }
  });

  await prisma.scanResultFile.create({
    data: {
      id: 'SCANFILE-0002',
      scanResultId: 'SCAN-RES-0002',
      fileName: 'abdomen-ultrasound-seed.dcm',
      fileType: 'application/dicom',
      fileSize: 2048000,
      storageKey: 'seed/scans/ORD-2026-0003/abdomen-ultrasound-seed.dcm',
      isDicom: true,
      studyUid: '1.2.826.0.1.3680043.10.1000.202606170003',
      seriesUid: '1.2.826.0.1.3680043.10.1000.202606170003.1',
      instanceUid: '1.2.826.0.1.3680043.10.1000.202606170003.1.1',
      modality: 'US',
      uploadedAt: date('2026-06-17T12:21:00Z')
    }
  });

  await prisma.scanReview.create({
    data: {
      id: 'SCNREV-0002',
      scanResultId: 'SCAN-RES-0002',
      decision: 'PENDING_REVIEW',
      note: 'Seeded imaging result awaiting radiologist sign-off.',
      createdAt: date('2026-06-17T12:20:00Z')
    }
  });
}

async function seedBillingAndFinance() {
  await prisma.cashierShift.create({
    data: {
      id: 'SHIFT-SEED-001',
      shiftCode: 'SHIFT-SEED-001',
      userId: 'USR-005',
      type: 'Full Day',
      status: ShiftStatus.CLOSED,
      openingFloat: '300',
      expectedCash: '430',
      countedCash: '430',
      variance: '0',
      startNotes: 'Seeded closed shift for float review.',
      closeNotes: 'Seeded closed shift balanced successfully.',
      startedAt: date('2026-06-17T08:00:00Z'),
      closedAt: date('2026-06-17T17:30:00Z')
    }
  });

  await prisma.floatTransaction.create({
    data: {
      id: 'FLT-0001',
      shiftId: 'SHIFT-SEED-001',
      userId: 'USR-005',
      type: FloatTransactionType.ADJUSTMENT,
      method: PaymentMethod.CASH,
      amount: '50',
      description: 'Opening petty cash top-up',
      reference: 'SEED-FLOAT-ADJ-001',
      createdAt: date('2026-06-17T08:05:00Z')
    }
  });

  let ledgerBalance = 0;

  for (const invoice of invoices) {
    const order = orders.find((item) => item.id === invoice.orderId);
    if (!order) continue;
    const amountPaid = invoice.transactions.reduce((total, transaction) => total + transaction.amount, 0);
    const status = invoiceStatusFromLabel(invoice.status);
    const balance = Math.max(invoice.amount - amountPaid, 0);

    await prisma.invoice.create({
      data: {
        id: invoice.id,
        invoiceCode: invoice.id,
        orderId: invoice.orderId,
        patientId: order.patientId,
        hospitalId: order.hospitalId,
        status,
        subtotal: String(invoice.amount),
        discount: '0',
        tax: '0',
        total: String(invoice.amount),
        amountPaid: String(amountPaid),
        balance: String(balance),
        insuranceClaimRef: 'insuranceReference' in invoice ? invoice.insuranceReference : undefined,
        createdById: 'USR-005',
        createdAt: date(invoice.createdAt)
      }
    });

    for (const itemId of order.itemIds) {
      const orderItemId = `OITEM-${order.id}-${itemId}`;
      const catalogItem = catalog.find((item) => item.id === itemId);
      if (!catalogItem) continue;
      await prisma.invoiceItem.create({
        data: {
          id: `INVITEM-${invoice.id}-${itemId}`,
          invoiceId: invoice.id,
          catalogItemId: itemId,
          orderItemId,
          description: catalogItem.name,
          quantity: 1,
          unitPrice: String(catalogItem.price),
          total: String(catalogItem.price)
        }
      });
    }

    for (const transaction of invoice.transactions) {
      await prisma.payment.create({
        data: {
          id: transaction.id,
          paymentCode: transaction.id,
          invoiceId: invoice.id,
          shiftId: 'SHIFT-SEED-001',
          receivedById: 'USR-005',
          method: paymentMethodFromLabel(transaction.method),
          status: PaymentStatus.COMPLETED,
          amount: String(transaction.amount),
          reference: `${transaction.id}-REF`,
          note: 'Seed payment created from frontend finance data.',
          createdAt: date(transaction.createdAt)
        }
      });

      await prisma.floatTransaction.create({
        data: {
          id: `FLT-${transaction.id}`,
          shiftId: 'SHIFT-SEED-001',
          userId: 'USR-005',
          paymentId: transaction.id,
          type: FloatTransactionType.PAYMENT,
          method: paymentMethodFromLabel(transaction.method),
          amount: String(transaction.amount),
          description: `Payment received for ${invoice.id}`,
          reference: transaction.id,
          createdAt: date(transaction.createdAt)
        }
      });

      ledgerBalance += transaction.amount;
      await prisma.ledgerEntry.create({
        data: {
          id: `LED-${transaction.id}`,
          entryCode: `LED-${transaction.id}`,
          type: LedgerEntryType.CREDIT,
          description: `Payment received for ${invoice.id}`,
          amount: String(transaction.amount),
          runningBalance: String(ledgerBalance),
          paymentId: transaction.id,
          floatTransactionId: `FLT-${transaction.id}`,
          userId: 'USR-005',
          createdAt: date(transaction.createdAt)
        }
      });

      await prisma.receipt.create({
        data: {
          id: `RCPT-${transaction.id}`,
          receiptCode: `RCPT-${transaction.id}`,
          paymentId: transaction.id,
          issuedAt: date(transaction.createdAt)
        }
      });
    }
  }

  for (const expense of expenses) {
    const balance = Math.max(expense.amount - expense.amountPaid, 0);
    await prisma.expense.create({
      data: {
        id: expense.id,
        expenseCode: expense.id,
        description: expense.description,
        category: expense.category,
        vendor: expense.vendor,
        status: expenseStatusFromLabel(expense.status),
        totalAmount: String(expense.amount),
        amountPaid: String(expense.amountPaid),
        balance: String(balance),
        writtenOffReason: 'writeOffReason' in expense ? expense.writeOffReason : undefined,
        supervisorApprovalNote: 'writeOffReason' in expense ? 'Seed supervisor approval for written-off consumables.' : undefined,
        createdById: 'USR-005',
        createdAt: date(expense.createdAt)
      }
    });

    for (const payment of expense.payments) {
      await prisma.expensePayment.create({
        data: {
          id: payment.id,
          expenseId: expense.id,
          paidById: 'USR-005',
          method: paymentMethodFromLabel(payment.method),
          amount: String(payment.amount),
          reference: `${payment.id}-REF`,
          createdAt: date(payment.createdAt)
        }
      });
      ledgerBalance -= payment.amount;
      await prisma.ledgerEntry.create({
        data: {
          id: `LED-${payment.id}`,
          entryCode: `LED-${payment.id}`,
          type: LedgerEntryType.DEBIT,
          description: `Expense payment for ${expense.id}: ${expense.description}`,
          amount: String(payment.amount),
          runningBalance: String(ledgerBalance),
          expenseId: expense.id,
          expensePaymentId: payment.id,
          userId: 'USR-005',
          createdAt: date(payment.createdAt)
        }
      });
    }
  }
}

async function seedReportsAndNotifications() {
  const reports = [
    { id: 'RPT-0001', orderId: 'ORD-2026-0004', labResultId: 'RES-0003', secureToken: 'seed-final-0004', generatedAt: '2026-06-16T18:31:00Z' },
    { id: 'RPT-0005', orderId: 'ORD-2026-0005', labResultId: 'RES-0005', secureToken: 'seed-final-0005', generatedAt: '2026-05-22T14:11:00Z' },
    { id: 'RPT-0006', orderId: 'ORD-2026-0006', labResultId: 'RES-0006', secureToken: 'seed-final-0006', generatedAt: '2026-06-03T15:31:00Z' }
  ];

  for (const report of reports) {
    await prisma.report.create({
      data: {
        id: report.id,
        reportCode: report.id,
        orderId: report.orderId,
        labResultId: report.labResultId,
        status: ReportStatus.GENERATED,
        generatedById: 'USR-003',
        secureToken: report.secureToken,
        generatedAt: date(report.generatedAt)
      }
    });

    await prisma.secureResultLink.create({
      data: {
        id: `LINK-${report.id}`,
        reportId: report.id,
        patientId: 'PAT-0001',
        createdById: 'USR-003',
        tokenHash: `${report.secureToken}-hash`,
        expiresAt: addHours(report.generatedAt, 24 * 30),
        createdAt: date(report.generatedAt)
      }
    });
  }

  for (const notification of notifications) {
    await prisma.notification.create({
      data: {
        id: notification.id,
        orderId: notification.entityId,
        createdById: notification.audienceUserId === 'USR-006' ? 'USR-006' : 'USR-003',
        recipientUserId: notification.audienceUserId,
        recipientEmail: notification.channel === 'Email' ? notification.target : undefined,
        recipientPhone: notification.channel === 'SMS' ? notification.target : undefined,
        type: notificationTypeFromTitle(notification.title),
        title: notification.title,
        body: notification.body,
        isRead: notification.read,
        createdAt: date(notification.createdAt),
        readAt: notification.read ? date(notification.createdAt) : undefined
      }
    });

    await prisma.deliveryLog.create({
      data: {
        id: `DLV-${notification.id}`,
        reportId: notification.entityId === 'ORD-2026-0004' ? 'RPT-0001' : undefined,
        notificationId: notification.id,
        performedById: notification.audienceUserId === 'USR-006' ? 'USR-006' : 'USR-003',
        channel: channelFromLabel(notification.channel),
        status: deliveryStatusFromLabel(notification.status),
        target: 'target' in notification ? notification.target : undefined,
        safeMessage: ['SMS', 'WhatsApp'].includes(notification.channel),
        retryCount: notification.status === 'Queued' ? 0 : 0,
        createdAt: date(notification.createdAt),
        deliveredAt: 'deliveredAt' in notification && notification.deliveredAt ? date(notification.deliveredAt) : undefined
      }
    });
  }
}

async function seedInventoryAndQualityControl() {
  await prisma.inventoryItem.createMany({
    data: [
      { id: 'INVITEM-LAB-001', itemCode: 'LAB-REAG-CBC-001', name: 'CBC Reagent Pack', category: 'Reagent', currentStock: '18', minLevel: '5', maxLevel: '30', unit: 'pack', supplier: 'Sysmex GH', expiryDate: date('2026-12-31T00:00:00Z') },
      { id: 'INVITEM-LAB-002', itemCode: 'LAB-TUBE-EDTA-001', name: 'EDTA Tubes', category: 'Consumable', currentStock: '450', minLevel: '100', maxLevel: '1000', unit: 'piece', supplier: 'MedSupply GH', expiryDate: date('2027-03-31T00:00:00Z') },
      { id: 'INVITEM-LAB-003', itemCode: 'LAB-GLU-STRIP-001', name: 'Glucose Test Strips', category: 'Consumable', currentStock: '120', minLevel: '40', maxLevel: '300', unit: 'strip', supplier: 'Diagnostics Plus', expiryDate: date('2026-10-31T00:00:00Z') }
    ]
  });

  await prisma.inventoryTransaction.createMany({
    data: [
      { id: 'INVTXN-001', inventoryItemId: 'INVITEM-LAB-001', type: 'STOCK_IN', quantity: '20', reason: 'Opening seed balance', performedById: 'USR-003', createdAt: date('2026-06-12T09:00:00Z') },
      { id: 'INVTXN-002', inventoryItemId: 'INVITEM-LAB-001', type: 'STOCK_OUT', quantity: '2', reason: 'Used for seeded CBC runs', performedById: 'USR-003', createdAt: date('2026-06-17T09:00:00Z') }
    ]
  });

  await prisma.qualityControlRun.createMany({
    data: [
      { id: 'QC-0001', catalogItemId: 't1', parameterName: 'Hemoglobin', controlLevel: 'Normal', value: '13.1', expectedMean: '13.0', standardDeviation: '0.4', result: 'PASS', notes: 'Seeded QC run for CBC analyzer.', performedById: 'USR-003', createdAt: date('2026-06-17T07:30:00Z') },
      { id: 'QC-0002', catalogItemId: 't3', parameterName: 'ALT (SGPT)', controlLevel: 'High', value: '71', expectedMean: '70', standardDeviation: '2', result: 'PASS', notes: 'Seeded QC run for chemistry analyzer.', performedById: 'USR-003', createdAt: date('2026-06-17T07:40:00Z') }
    ]
  });
}

async function seedAuditAndSystemEvents() {
  await prisma.auditLog.createMany({
    data: [
      { id: 'AUD-001', actorId: 'USR-006', actorRole: UserRole.ADMIN, action: 'SEED_DATABASE', module: 'Seed Data', entityType: 'Database', details: { phase: 'Backend Phase 9', message: 'Frontend-compatible demo data seeded successfully.' }, createdAt: date('2026-06-17T12:00:00Z') },
      { id: 'AUD-002', actorId: 'USR-001', actorRole: UserRole.DOCTOR, action: 'ORDER_CREATED', module: 'Doctor', entityType: 'Order', entityId: 'ORD-2026-0001', details: { seed: true }, createdAt: date('2026-06-17T10:15:00Z') },
      { id: 'AUD-003', actorId: 'USR-005', actorRole: UserRole.BILLING_STAFF, action: 'PAYMENT_RECORDED', module: 'Finance', entityType: 'Payment', entityId: 'TXN-0001', details: { seed: true }, createdAt: date('2026-06-17T11:40:00Z') }
    ]
  });

  await prisma.systemEvent.createMany({
    data: [
      { id: 'SYS-0001', actorId: 'USR-006', level: 'info', source: 'SeedData', message: 'Backend Phase 9 seed data installed.', details: { phase: 9 }, createdAt: date('2026-06-17T12:30:00Z') },
      { id: 'SEC-0001', actorId: 'USR-006', level: 'info', source: 'Security Baseline', message: 'Security, audit and reliability layer initialized.', details: { acknowledged: true, severity: 'Low' }, createdAt: date('2026-06-17T12:30:00Z') }
    ]
  });
}

async function main() {
  await resetDemoData();
  await seedUsersAndDoctors();
  await seedDepartmentsAndEquipment();
  await seedPatients();
  await seedCatalogAndReferenceRanges();
  await seedOrders();
  await seedReceptionWorkflow();
  await seedLabAndScanWorkflow();
  await seedBillingAndFinance();
  await seedReportsAndNotifications();
  await seedInventoryAndQualityControl();
  await seedAuditAndSystemEvents();

  console.log('Seeded Backend Phase 9 frontend-compatible demo database.');
  console.log('Demo logins: admin/admin123, doctor/doctor123, reception/reception123, lab/lab123, scan/scan123, billing/billing123');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
