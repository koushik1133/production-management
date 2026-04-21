import type { Trailer } from '../types';

export const exportToCsv = (trailers: Trailer[]) => {
  const headers = ['ID', 'Customer', 'Model', 'Serial', 'Station', 'Current Phase', 'Date Started', 'Is Priority', 'Notes'];
  const rows = trailers.map(t => [
    t.id,
    t.name,
    t.model,
    t.serialNumber,
    t.station,
    t.currentPhase,
    new Date(t.dateStarted).toISOString(),
    t.isPriority ? 'Yes' : 'No',
    (t.notes || '').replace(/,/g, ';')
  ]);

  const csvContent = "data:text/csv;charset=utf-8," 
    + headers.join(",") + "\n"
    + rows.map(e => e.join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `production_report_${new Date().toLocaleDateString()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const parseCsv = (csvText: string): Partial<Trailer>[] => {
  const lines = csvText.split('\n');
  const result: Partial<Trailer>[] = [];
  
  // Basic parser (assumes headers match)
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 3) continue;
    
    // Skip if required fields are missing
    if (!cols[2]) {
      console.warn(`Skipping CSV line ${i}: Missing required Model (Col 2).`);
      continue;
    }
    
    result.push({
      id: cols[0] || crypto.randomUUID(),
      name: cols[1] || '---',
      model: cols[2],
      serialNumber: cols[3] || `LT-${Math.floor(10000 + Math.random() * 90000)}`,
      station: (cols[4] || 'B1') as any,
      currentPhase: (cols[5] || 'backlog') as any,
      dateStarted: Date.parse(cols[6]) || Date.now(),
      isPriority: cols[7] === 'Yes',
      notes: cols[8]
    });
  }
  return result;
};
