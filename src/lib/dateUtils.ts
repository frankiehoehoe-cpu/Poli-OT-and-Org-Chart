import { format, parseISO } from 'date-fns';

export const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    // If it's in YYYY-MM-DD format (standard for HTML5 date inputs)
    if (dateStr.includes('-')) {
      const [year, month, day] = dateStr.split('-');
      // Ensure we display as DD/MM/YYYY consistently
      return `${day}/${month}/${year}`;
    }
    return format(parseISO(dateStr), 'dd/MM/yyyy');
  } catch (e) {
    return dateStr;
  }
};

export const formatDateWithDay = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr);
    // Format: DD/MM/YYYY (EEE)
    return `${format(d, 'dd/MM/yyyy')} (${format(d, 'EEE')})`;
  } catch (e) {
    return dateStr;
  }
};

export const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  try {
    const [hours, minutes] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    return format(date, 'hh:mm a');
  } catch (e) {
    return timeStr;
  }
};

export const formatDateFriendly = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr);
    return format(d, 'd MMM yyyy (EEE)');
  } catch (e) {
    return '';
  }
};

export const formatMonth = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length < 2) return dateStr;
    
    const year = parseInt(parts[0]);
    const monthIndex = parseInt(parts[1]) - 1;
    
    const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (monthIndex < 0 || monthIndex > 11) return dateStr;
    
    return `${monthsEn[monthIndex]} ${year}`;
  } catch (e) {
    return dateStr;
  }
};

export const parseDate = (displayDate: string): string | null => {
  if (!displayDate) return null;
  
  // Clean input: replace common separators with /
  const cleaned = displayDate.replace(/[-.\s]/g, '/');
  
  // Try parsing DD/MM/YYYY
  const parts = cleaned.split('/');
  if (parts.length === 3) {
    let day = parts[0];
    let month = parts[1];
    let year = parts[2];
    
    // Auto-fix short year
    if (year.length === 2) {
      year = '20' + year;
    }

    const paddedDay = day.padStart(2, '0');
    const paddedMonth = month.padStart(2, '0');
    
    if (paddedDay.length === 2 && paddedMonth.length === 2 && year.length === 4) {
      // Validate logical boundaries
      const d = parseInt(paddedDay);
      const m = parseInt(paddedMonth);
      const y = parseInt(year);
      if (d > 0 && d <= 31 && m > 0 && m <= 12 && y > 2000) {
        return `${year}-${paddedMonth}-${paddedDay}`;
      }
    }
  }
  
  // Try parsing YYYY-MM-DD
  const isoParts = cleaned.split('/'); // already replaced - with /
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    const year = isoParts[0];
    const month = isoParts[1].padStart(2, '0');
    const day = isoParts[2].padStart(2, '0');
    if (year.length === 4 && month.length === 2 && day.length === 2) {
      return `${year}-${month}-${day}`;
    }
  }

  return null;
};
