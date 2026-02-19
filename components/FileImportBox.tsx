import { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Upload, FileSpreadsheet, Check, AlertTriangle } from 'lucide-react-native';
import { AppColors } from '@/constants/appColors';

type TicketRow = {
  totalPrice: number;
  eventName: string;
  eventStartTime: string;
  tickets: { section: string; row: string; seat_number: number }[];
};

type ImportResult = {
  success: boolean;
  salesCount: number;
  seatPairsCount: number;
  message?: string;
};

interface FileImportBoxProps {
  onImport: (rows: TicketRow[]) => Promise<ImportResult>;
  activePassId: string | null;
}

type ImportStatus = 'idle' | 'parsing' | 'importing' | 'success' | 'error';

function parseCSVContent(text: string): TicketRow[] {
  console.log('[FileImport] Parsing CSV content, length:', text.length);
  // Accept pasted text in the exact format of the provided CSV, ignore extra columns and trailing commas
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    console.log('[FileImport] CSV has fewer than 2 lines');
    return [];
  }
  const header = lines[0].split(',').map(h => h.trim());
  const colMap: Record<string, number> = {};
  header.forEach((h, i) => {
    if (h) colMap[h] = i;
  });
  // Only require columns present in the user's file
  const requiredCols = ['GameID', 'PairID', 'Section', 'Row', 'Seats', 'SeatCount', 'Price', 'PaymentStatus'];
  if (!requiredCols.every(col => col in colMap)) {
    console.log('[FileImport] Missing required columns:', requiredCols.filter(col => !(col in colMap)));
    return [];
  }
  const rows: TicketRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    // Defensive: skip if row is too short
    if (row.length < header.length - 2) continue;
    const gameId = row[colMap['GameID']];
    const pairId = row[colMap['PairID']];
    const section = row[colMap['Section']];
    const r = row[colMap['Row']];
    const seats = row[colMap['Seats']];
    const seatCount = Number(row[colMap['SeatCount']]);
    const price = Number(row[colMap['Price']]);
    const paymentStatus = row[colMap['PaymentStatus']];
    if (!gameId || !pairId || !section || !r || !seats || !seatCount || !price) continue;
    // Parse seat numbers (e.g., 24-25 or 1-2)
    let ticketSeats: number[] = [];
    if (seats && seats.includes('-')) {
      const [a, b] = seats.split('-').map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        for (let s = a; s <= b; s++) ticketSeats.push(s);
      }
    } else if (seats) {
      seats.split(',').forEach((s) => {
        const n = Number(s.trim());
        if (Number.isFinite(n)) ticketSeats.push(n);
      });
    } else {
      for (let s = 1; s <= seatCount; s++) ticketSeats.push(s);
    }
    rows.push({
      totalPrice: price,
      eventName: '',
      eventStartTime: '',
      tickets: ticketSeats.map(sn => ({
        section,
        row: r,
        seat_number: sn,
        paymentStatus,
      })),
    });
  }
  console.log('[FileImport][DEBUG] Parsed rows:', rows.length);
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function isZipLikeContent(text: string): boolean {
  const head = text.slice(0, 20);
  if (head.startsWith('PK') || head.startsWith('UEsDB')) return true;
  return /PK\x03\x04/.test(head);
}

function parseJSONContent(text: string): TicketRow[] {
  console.log('[FileImport] Parsing JSON content, length:', text.length);
  const trimmed = text.trimStart();
  if (isZipLikeContent(trimmed)) {
    console.error('[FileImport] JSON parse error: ZIP/Excel signature detected');
    return [];
  }

  let data: any;
  try {
    data = JSON.parse(trimmed);
  } catch (e) {
    console.error('[FileImport] JSON parse error:', e);
    return [];
  }

  // Accept top-level salesData object (either wrapped or raw)
  if (data && typeof data === 'object') {
    // If file is just the salesData object itself
    if (data.pair1 || data['1'] || data['p1']) {
      // Looks like a raw salesData object (gameId keys)
      data = { salesData: data };
    }
    // If file is { salesData: ... }
    if (data.salesData && typeof data.salesData === 'object') {
      // Wrap in a fake seasonPasses array for compatibility
      data = { seasonPasses: [{ salesData: data.salesData }] };
    }
  }

  let arr: any[] = [];
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === 'object') {
    if (Array.isArray(data.sales)) arr = data.sales;
    else if (Array.isArray(data.data)) arr = data.data;
    else if (Array.isArray(data.rows)) arr = data.rows;
    else if (Array.isArray(data.records)) arr = data.records;
    else if (Array.isArray(data.seasonPasses)) {
      const allRows: TicketRow[] = [];
      for (const sp of data.seasonPasses) {
        if (sp.salesData && typeof sp.salesData === 'object') {
          for (const [, gameSales] of Object.entries(sp.salesData as Record<string, Record<string, any>>)) {
            for (const [, sale] of Object.entries(gameSales as Record<string, any>)) {
              if (sale && typeof sale === 'object' && sale.price != null) {
                const seatNums: number[] = [];
                const seatsStr = sale.seats || '';
                if (seatsStr.includes('-')) {
                  const [a, b] = seatsStr.split('-').map(Number);
                  if (Number.isFinite(a) && Number.isFinite(b)) {
                    for (let s = a; s <= b; s++) seatNums.push(s);
                  }
                } else if (seatsStr) {
                  seatsStr.split(',').forEach((s: string) => {
                    const n = Number(s.trim());
                    if (Number.isFinite(n)) seatNums.push(n);
                  });
                }
                allRows.push({
                  totalPrice: Number(sale.price) || 0,
                  eventName: sale.opponent || sale.eventName || '',
                  eventStartTime: sale.soldDate || sale.eventStartTime || '',
                  tickets: seatNums.map(sn => ({
                    section: sale.section || '',
                    row: sale.row || '',
                    seat_number: sn,
                  })),
                });
              }
            }
          }
        }
      }
      console.log('[FileImport] Parsed backup JSON with', allRows.length, 'sale records');
      return allRows;
    }
  }

  const rows: TicketRow[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;

    const totalPrice = Number(item.totalPrice ?? item.total_price ?? item.price ?? item.amount ?? 0);
    const eventName = item.eventName ?? item.event_name ?? item.opponent ?? item.name ?? '';
    const eventStartTime = item.eventStartTime ?? item.event_start_time ?? item.date ?? item.startTime ?? '';

    if (!Number.isFinite(totalPrice) || !eventName || !eventStartTime) continue;

    let isoDate = eventStartTime;
    try {
      const d = new Date(eventStartTime);
      if (!isNaN(d.getTime())) isoDate = d.toISOString();
    } catch { /* keep original */ }

    let tickets: TicketRow['tickets'] = [];
    if (Array.isArray(item.tickets)) {
      tickets = item.tickets.map((t: any) => ({
        section: String(t.section ?? '').trim(),
        row: String(t.row ?? '').trim(),
        seat_number: Number(t.seat_number ?? t.seatNumber ?? 0),
      })).filter((t: any) => t.section && t.row && t.seat_number > 0);
    } else if (item.section && item.row) {
      const seatNum = Number(item.seat_number ?? item.seatNumber ?? item.seat ?? 0);
      if (seatNum > 0) {
        tickets = [{ section: String(item.section), row: String(item.row), seat_number: seatNum }];
      } else if (item.seats) {
        const seatsStr = String(item.seats);
        const seatNums: number[] = [];
        if (seatsStr.includes('-')) {
          const [a, b] = seatsStr.split('-').map(Number);
          if (Number.isFinite(a) && Number.isFinite(b)) {
            for (let s = a; s <= b; s++) seatNums.push(s);
          }
        } else {
          seatsStr.split(',').forEach((s: string) => {
            const n = Number(s.trim());
            if (Number.isFinite(n)) seatNums.push(n);
          });
        }
        tickets = seatNums.map(sn => ({ section: String(item.section), row: String(item.row), seat_number: sn }));
      }
    }

    rows.push({ totalPrice, eventName, eventStartTime: isoDate, tickets });
  }

  console.log('[FileImport] JSON parsed rows:', rows.length);
  return rows;
}

async function parseExcelContent(_base64OrUri: string, _isBase64: boolean): Promise<TicketRow[]> {
  console.log('[FileImport] Excel parsing is not supported in this environment. Please convert to CSV or JSON.');
  return [];
}

export default function FileImportBox({ onImport, activePassId }: FileImportBoxProps) {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [isImportingText, setIsImportingText] = useState(false);
  const dropRef = useRef<View>(null);

  const processFile = useCallback(async (content: string, fileName: string, isBase64: boolean = false) => {
    if (!activePassId) {
      Alert.alert('Error', 'No active season pass. Create or select a pass first.');
      return;
    }

    setStatus('parsing');
    setStatusMessage(`Parsing ${fileName}...`);
    console.log('[FileImport] Processing file:', fileName);

    try {
      let rows: TicketRow[] = [];
      const ext = fileName.toLowerCase().split('.').pop() || '';
      const trimmed = content.trimStart();

      if (isZipLikeContent(trimmed) || trimmed.startsWith('PK')) {
        console.log('[FileImport] Detected Excel/ZIP binary signature (PK) regardless of extension');
        setStatus('error');
        setStatusMessage('This file is an Excel/ZIP archive. Please save as CSV or JSON and re-import.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      if (ext === 'json') {
        rows = parseJSONContent(trimmed);
      } else if (ext === 'csv' || ext === 'tsv') {
        rows = parseCSVContent(trimmed);
      } else if (ext === 'xlsx' || ext === 'xls') {
        setStatus('error');
        setStatusMessage('Excel files are not supported. Please save as CSV or JSON and re-import.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      } else {
        if (isZipLikeContent(trimmed)) {
          setStatus('error');
          setStatusMessage('This looks like an Excel file. Please save as CSV or JSON and re-import.');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }
        try {
          rows = parseJSONContent(trimmed);
        } catch {
          rows = parseCSVContent(trimmed);
        }
      }

      if (rows.length === 0) {
        setStatus('error');
        setStatusMessage('No valid sales data found in file. Check format.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      const uniqueSeats = new Set<string>();
      rows.forEach(r => r.tickets.forEach(t => uniqueSeats.add(`${t.section}|${t.row}`)));

      setStatus('importing');
      setStatusMessage(`Importing ${rows.length} sales across ${uniqueSeats.size} seat pairs...`);

      const result = await onImport(rows);

      if (result.success) {
        setStatus('success');
        let msg = `Imported ${result.salesCount} sales, ${result.seatPairsCount} seat pairs`;
        if (result.message) msg += `\n${result.message}`;
        setStatusMessage(msg);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setStatus('error');
        setStatusMessage(result.message || 'Import failed.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (e: any) {
      console.error('[FileImport] processFile error:', e);
      setStatus('error');
      setStatusMessage(`Error: ${e?.message || 'Unknown error'}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [activePassId, onImport]);

  const handlePickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/json',
          'text/csv',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const asset = res.assets[0];
      const fileName = asset.name || 'unknown';
      const ext = fileName.toLowerCase().split('.').pop() || '';

      if (ext === 'xlsx' || ext === 'xls') {
        Alert.alert('Unsupported Format', 'Excel files (.xlsx/.xls) are not supported. Please save your spreadsheet as CSV or JSON and import that instead.');
        return;
      }

      let content: string;
      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        const buf = await response.arrayBuffer();
        const bytes = new Uint8Array(buf);
        if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B) {
          Alert.alert('Unsupported Format', 'This file is an Excel/ZIP archive. Please save your spreadsheet as CSV or JSON and import that instead.');
          return;
        }
        const decoder = new TextDecoder('utf-8');
        content = decoder.decode(buf);
      } else {
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (content.startsWith('PK')) {
          Alert.alert('Unsupported Format', 'This file is an Excel/ZIP archive. Please save your spreadsheet as CSV or JSON and import that instead.');
          return;
        }
      }
      await processFile(content, fileName, false);
    } catch (e: any) {
      console.error('[FileImport] handlePickFile error:', e);
      Alert.alert('Error', 'Could not open file picker.');
    }
  }, [processFile]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      const fileName = file.name || 'unknown';
      const ext = fileName.toLowerCase().split('.').pop() || '';
      console.log('[FileImport] Dropped file:', fileName, 'type:', file.type, 'size:', file.size);

      if (ext === 'xlsx' || ext === 'xls') {
        Alert.alert('Unsupported Format', 'Excel files (.xlsx/.xls) are not supported. Please save your spreadsheet as CSV or JSON and import that instead.');
        return;
      }

      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4B) {
        Alert.alert('Unsupported Format', 'This file is an Excel/ZIP archive. Please save your spreadsheet as CSV or JSON and import that instead.');
        return;
      }

      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(buf);
      await processFile(text, fileName, false);
    };

    const el = document.getElementById('file-import-drop-zone');
    if (el) {
      el.addEventListener('dragover', handleDragOver);
      el.addEventListener('dragleave', handleDragLeave);
      el.addEventListener('drop', handleDrop);
      return () => {
        el.removeEventListener('dragover', handleDragOver);
        el.removeEventListener('dragleave', handleDragLeave);
        el.removeEventListener('drop', handleDrop);
      };
    }
  }, [processFile]);

  const resetStatus = useCallback(() => {
    setStatus('idle');
    setStatusMessage('');
  }, []);

  const isProcessing = status === 'parsing' || status === 'importing';

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <FileSpreadsheet size={18} color="#059669" />
        <Text style={styles.title}>Import Sales File</Text>
      </View>
      <Text style={styles.subtitle}>
        Drop or select a JSON, CSV, or Excel file to replace sales data
      </Text>

      <TouchableOpacity
        onPress={isProcessing ? undefined : handlePickFile}
        disabled={isProcessing}
        activeOpacity={0.7}
        style={[
          styles.dropZone,
          isDragOver && styles.dropZoneActive,
          status === 'success' && styles.dropZoneSuccess,
          status === 'error' && styles.dropZoneError,
        ]}
        testID="fileImportBox.dropZone"
      >
        <View
          ref={dropRef}
          nativeID="file-import-drop-zone"
          style={styles.dropZoneInner}
        >
          {isProcessing ? (
            <ActivityIndicator size="large" color="#059669" />
          ) : status === 'success' ? (
            <Check size={32} color="#059669" />
          ) : status === 'error' ? (
            <AlertTriangle size={32} color="#DC2626" />
          ) : (
            <Upload size={32} color={isDragOver ? '#059669' : '#9CA3AF'} />
          )}

          <Text style={[
            styles.dropText,
            status === 'success' && { color: '#059669' },
            status === 'error' && { color: '#DC2626' },
          ]}>
            {isProcessing
              ? statusMessage
              : status === 'success'
              ? statusMessage
              : status === 'error'
              ? statusMessage
              : Platform.OS === 'web'
              ? 'Drag & drop file here, or tap to browse'
              : 'Tap to select a file'}
          </Text>

          <Text style={styles.formatHint}>
            Supports: .json, .csv
          </Text>
        </View>
      </TouchableOpacity>

      <Text style={{ marginVertical: 8, fontWeight: 'bold', textAlign: 'center' }}>OR</Text>
      {Platform.OS === 'web' ? (
        <textarea
          style={{
            minHeight: 100,
            width: '100%',
            borderColor: '#ccc',
            borderWidth: 1,
            borderRadius: 8,
            padding: 8,
            marginBottom: 8,
            fontFamily: 'monospace',
            resize: 'vertical',
          }}
          placeholder="Paste CSV data here..."
          value={pastedText}
          onChange={e => setPastedText(e.target.value)}
          disabled={isImportingText || isProcessing}
        />
      ) : (
        <TextInput
          style={{
            minHeight: 100,
            borderColor: '#ccc',
            borderWidth: 1,
            borderRadius: 8,
            padding: 8,
            marginBottom: 8,
            fontFamily: 'monospace',
          }}
          multiline
          placeholder="Paste CSV data here..."
          value={pastedText}
          onChangeText={setPastedText}
          editable={!isImportingText && !isProcessing}
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}
      <TouchableOpacity
        style={[styles.resetButton, { backgroundColor: '#059669', marginBottom: 8 }]}
        onPress={async () => {
          setIsImportingText(true);
          setStatus('parsing');
          setStatusMessage('Parsing pasted text...');
          try {
            const rows = parseCSVContent(pastedText);
            if (!rows.length) throw new Error('No valid data found in pasted text.');
            setStatus('importing');
            setStatusMessage('Importing pasted data...');
            // Patch: Use replaceSalesDataFromPastedSeed for full sales log replacement
            if (typeof window !== 'undefined' && (window as any).SeasonPassProvider && (window as any).SeasonPassProvider.replaceSalesDataFromPastedSeed) {
              const result = await (window as any).SeasonPassProvider.replaceSalesDataFromPastedSeed(pastedText, activePassId);
              setStatus(result.success ? 'success' : 'error');
              setStatusMessage(result.message || (result.success ? 'Import successful!' : 'Import failed.'));
            } else {
              // Fallback: Use onImport for environments where provider is not exposed
              const result = await onImport(rows);
              setStatus(result.success ? 'success' : 'error');
              setStatusMessage(result.message || (result.success ? 'Import successful!' : 'Import failed.'));
            }
          } catch (err: any) {
            setStatus('error');
            setStatusMessage(err.message || 'Import failed.');
          } finally {
            setIsImportingText(false);
          }
        }}
        disabled={isImportingText || isProcessing || !pastedText.trim()}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>{isImportingText ? 'Importing...' : 'Import Pasted CSV Text'}</Text>
      </TouchableOpacity>

      {(status === 'success' || status === 'error') && (
        <TouchableOpacity
          style={styles.resetButton}
          onPress={resetStatus}
          testID="fileImportBox.reset"
        >
          <Text style={styles.resetButtonText}>
            {status === 'success' ? 'Import Another' : 'Try Again'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: AppColors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginBottom: 14,
    fontWeight: '500' as const,
  },
  dropZone: {
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed' as const,
    borderRadius: 14,
    overflow: 'hidden' as const,
  },
  dropZoneActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  dropZoneSuccess: {
    borderColor: '#059669',
    borderStyle: 'solid' as const,
    backgroundColor: '#F0FDF4',
  },
  dropZoneError: {
    borderColor: '#DC2626',
    borderStyle: 'solid' as const,
    backgroundColor: '#FEF2F2',
  },
  dropZoneInner: {
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 10,
  },
  dropText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#6B7280',
    textAlign: 'center' as const,
    lineHeight: 20,
  },
  formatHint: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500' as const,
  },
  resetButton: {
    marginTop: 10,
    alignSelf: 'center' as const,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#374151',
  },
});
