/**
 * React PDF document for invoice generation.
 * Uses @react-pdf/renderer — renders server-side to a PDF buffer.
 */
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer';
import type { InvoiceTemplateData } from './invoice-template';

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
};

// ── Styles ──────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1a1a1a',
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 55,
    lineHeight: 1.5,
  },

  // Header
  senderName: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  senderMeta: { fontSize: 9, color: '#666', marginBottom: 1 },

  // DIN 5008 sender line
  senderLine: {
    fontSize: 7,
    color: '#999',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
    paddingBottom: 2,
    marginTop: 20,
    marginBottom: 4,
  },

  // Recipient block
  recipientBlock: { marginBottom: 22 },
  recipientName: { fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  recipientLine: { color: '#444' },

  // Invoice title + meta
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  invoiceTitle: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  metaRight: { textAlign: 'right' },
  metaLabel: { color: '#666', fontSize: 9 },
  metaValue: { fontFamily: 'Helvetica-Bold', fontSize: 9, marginBottom: 2 },

  // Table
  table: { marginBottom: 16 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e8e8e8',
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  tableFooter: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    borderTopColor: '#1a1a1a',
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 2,
  },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#444' },
  tdText: { fontSize: 9, color: '#1a1a1a' },
  tdMuted: { fontSize: 8, color: '#888', marginTop: 1 },
  tfText: { fontSize: 9, fontFamily: 'Helvetica-Bold' },

  // Column widths
  colNr:       { width: '6%' },
  colDesc:     { width: '42%' },
  colPlatform: { width: '14%' },
  colViews:    { width: '14%', textAlign: 'right' },
  colRate:     { width: '12%', textAlign: 'right' },
  colAmount:   { width: '12%', textAlign: 'right' },

  // Tax note
  taxNote: {
    fontSize: 9,
    color: '#666',
    backgroundColor: '#fafafa',
    padding: 10,
    marginBottom: 22,
    borderRadius: 3,
  },

  // Payment section
  paymentTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 6, fontSize: 10 },
  paymentText: { fontSize: 9, color: '#444', marginBottom: 3 },
  paymentBold: { fontFamily: 'Helvetica-Bold', color: '#1a1a1a' },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 55,
    right: 55,
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
    paddingTop: 8,
    textAlign: 'center',
    fontSize: 8,
    color: '#aaa',
  },
});

// ── Helpers ──────────────────────────────────────────────────────
function fmtEur(n: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat('de-DE').format(n);
}

// ── Document ─────────────────────────────────────────────────────
export function InvoicePDF({ data }: { data: InvoiceTemplateData }) {
  const senderDisplay = data.sender.company || data.sender.name;

  return (
    <Document
      title={`Rechnung ${data.invoiceNumber}`}
      author={senderDisplay}
      subject="Rechnung"
    >
      <Page size="A4" style={s.page}>

        {/* ── Sender header ── */}
        <Text style={s.senderName}>{senderDisplay}</Text>
        {data.sender.address && <Text style={s.senderMeta}>{data.sender.address}</Text>}
        {data.sender.taxId  && <Text style={s.senderMeta}>USt-IdNr.: {data.sender.taxId}</Text>}

        {/* ── DIN 5008 sender line ── */}
        <Text style={s.senderLine}>
          {data.sender.name}{data.sender.address ? ` · ${data.sender.address}` : ''}
        </Text>

        {/* ── Recipient ── */}
        <View style={s.recipientBlock}>
          <Text style={s.recipientName}>{data.recipient.name}</Text>
          {data.recipient.address && <Text style={s.recipientLine}>{data.recipient.address}</Text>}
          {data.recipient.taxId   && <Text style={s.recipientLine}>USt-IdNr.: {data.recipient.taxId}</Text>}
        </View>

        {/* ── Invoice title + meta ── */}
        <View style={s.metaRow}>
          <Text style={s.invoiceTitle}>Rechnung</Text>
          <View style={s.metaRight}>
            <Text style={s.metaValue}>Nr.: {data.invoiceNumber}</Text>
            <Text style={s.metaLabel}>Datum: {data.invoiceDate}</Text>
            <Text style={s.metaLabel}>Zeitraum: {data.periodStart} – {data.periodEnd}</Text>
          </View>
        </View>

        {/* ── Line items table ── */}
        <View style={s.table}>
          {/* Header */}
          <View style={s.tableHeader}>
            <Text style={[s.thText, s.colNr]}>Nr.</Text>
            <Text style={[s.thText, s.colDesc]}>Beschreibung</Text>
            <Text style={[s.thText, s.colPlatform]}>Plattform</Text>
            <Text style={[s.thText, s.colViews]}>Views</Text>
            <Text style={[s.thText, s.colRate]}>Preis/View</Text>
            <Text style={[s.thText, s.colAmount]}>Betrag</Text>
          </View>

          {/* Rows */}
          {data.items.map((item) => (
            <View key={item.position} style={s.tableRow} wrap={false}>
              <Text style={[s.tdText, s.colNr]}>{item.position}</Text>
              <View style={s.colDesc}>
                <Text style={s.tdText}>{item.title || 'Video'}</Text>
                <Text style={s.tdMuted}>{item.url}</Text>
              </View>
              <Text style={[s.tdText, s.colPlatform]}>
                {PLATFORM_LABELS[item.platform] || item.platform}
              </Text>
              <Text style={[s.tdText, s.colViews]}>{fmtNum(item.views)}</Text>
              <Text style={[s.tdText, s.colRate]}>{fmtEur(item.ratePerView)}</Text>
              <Text style={[s.tdText, s.colAmount]}>{fmtEur(item.amount)}</Text>
            </View>
          ))}

          {/* Footer totals */}
          <View style={s.tableFooter}>
            <Text style={[s.tfText, s.colNr]} />
            <Text style={[s.tfText, s.colDesc]}>Gesamt</Text>
            <Text style={[s.tfText, s.colPlatform]} />
            <Text style={[s.tfText, s.colViews]}>{fmtNum(data.totalViews)}</Text>
            <Text style={[s.tfText, s.colRate]} />
            <Text style={[s.tfText, s.colAmount]}>{fmtEur(data.totalAmount)}</Text>
          </View>
        </View>

        {/* ── Tax note ── */}
        <Text style={s.taxNote}>
          Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).
        </Text>

        {/* ── Payment info ── */}
        <View>
          <Text style={s.paymentTitle}>Zahlungsinformationen</Text>
          <Text style={s.paymentText}>
            Bitte überweisen Sie den Betrag von{' '}
            <Text style={s.paymentBold}>{fmtEur(data.totalAmount)}</Text>
            {' '}innerhalb von{' '}
            <Text style={s.paymentBold}>30 Tagen</Text>
            {' '}auf folgendes Konto:
          </Text>
          {data.sender.iban && (
            <Text style={s.paymentText}>
              <Text style={s.paymentBold}>IBAN: </Text>{data.sender.iban}
            </Text>
          )}
          <Text style={s.paymentText}>
            <Text style={s.paymentBold}>Kontoinhaber: </Text>{senderDisplay}
          </Text>
          <Text style={s.paymentText}>
            <Text style={s.paymentBold}>Verwendungszweck: </Text>{data.invoiceNumber}
          </Text>
        </View>

        {/* ── Footer ── */}
        <Text style={s.footer}>
          {senderDisplay}
          {data.sender.address ? ` · ${data.sender.address}` : ''}
          {data.sender.taxId ? ` · USt-IdNr.: ${data.sender.taxId}` : ''}
        </Text>

      </Page>
    </Document>
  );
}
