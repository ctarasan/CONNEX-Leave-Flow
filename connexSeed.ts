/**
 * ข้อมูลเริ่มต้นจาก CONNEX_Data.csv
 * คอลัมน์: ID, Name, StartDate, Position, Email, Under, Password
 * วันที่ใน CSV เป็น พ.ศ. (D/M/25XX) แปลงเป็น ค.ศ. (YYYY-MM-DD)
 */

export interface ConnexRow {
  id: string;
  name: string;
  startDate: string;
  position: string;
  email: string;
  under: string;
  password: string;
}

/** แปลงวันที่ พ.ศ. D/M/25XX เป็น YYYY-MM-DD */
function thaiDateToISO(thaiDate: string): string {
  const parts = thaiDate.trim().split('/');
  if (parts.length !== 3) return '';
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const yearBE = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(yearBE)) return '';
  const yearCE = yearBE - 543;
  return `${yearCE}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** แยกแถว CSV (รองรับค่าที่มี comma ใน quoted field) */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if ((c === ',' && !inQuotes) || (c === '\r' && !inQuotes)) {
      result.push(current.trim());
      current = '';
      if (c === '\r') break;
    } else if (c !== '\r') current += c;
  }
  result.push(current.trim());
  return result;
}

const CONNEX_CSV = `ID,Name,StartDate,Position,Email,Under,Password
001,นายชำนาญ ธรสารสมบัติ,8/7/2547,Managing Director,chamnan.t@b-connex.net,,001
002,นายสารวุฒิ พิทักษ์เศวตไชย,8/7/2547,Software Development Manager,sarawuth.p@b-connex.net,001,002
003,นางพูลทรัพย์ ธรสารสมบัติ,8/7/2547,Financial Director,poolsub.t@b-connex.net,001,003
004,นางสาวศรีประไพ ศรีติมงคล,1/11/2555,Project Manager,sriprapai.s@b-connex.net,002,004
005,นายอนุมาศ ไชยชนะ,2/5/2557,Project Manager,anumart.c@b-connex.net,002,005
008,นายชัยวัฒน์ พัฒนา,2/3/2561,Programmer,cptarasan@gmail.com,001,008
011,นายนารงค์ศร สุขสวัสดิ์,26/1/2564,System Analyst,narongsorn.s@b-connex.net,002,011
012,นางสาวพนาพร จันทร์เพ็ญ,26/4/2564,Business Analyst,panaphon.c@b-connex.net,002,012
013,นายณัฐวุฒิ วงศ์ประเสริฐ,27/6/2565,Senior System Analyst,nattawut.w@b-connex.net,002,013
017,นายวีรพล สุขใจ,1/9/2566,Senior Programmer,weeraphon.s@b-connex.net,002,017
020,นางสาวสุกัญญา มานะ,4/6/2567,Quality Assurance,sukanya.m@b-connex.net,002,020
021,นายกนิษฐ์ สมบัติ,17/2/2568,Brand Strategic Manager,kanit.s@b-connex.net,002,021
023,นางสาวอัญชิตา ชนะกุล,17/4/2568,Creative Designer,aunchitta.c@b-connex.net,002,023
025,นายสุภณัฐ พัฒน์,26/5/2568,Quality Assurance,supanat.p@b-connex.net,002,025
026,นายสรจิน อิทธิ,4/8/2568,Programmer,sorrajin.i@b-connex.net,002,026
027,นางสาวกัญญาพัก จันทร์,8/9/2568,Sale Executive,kanyapak.c@b-connex.net,002,027
028,นายมูฮัมหมัด กีรติ,26/9/2568,Programmer,muhammadnurdeen.k@b-connex.net,002,028
`;

export function parseConnexCSV(): ConnexRow[] {
  const lines = CONNEX_CSV.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const rows: ConnexRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length >= 7) {
      rows.push({
        id: cols[0].trim(),
        name: cols[1].trim(),
        startDate: cols[2].trim(),
        position: cols[3].trim(),
        email: cols[4].trim(),
        under: cols[5].trim(),
        password: cols[6].trim(),
      });
    }
  }
  return rows;
}

export function thaiDateToISODate(thaiDate: string): string {
  return thaiDateToISO(thaiDate);
}
