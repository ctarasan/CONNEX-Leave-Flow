import React, { useState, useRef, useEffect } from 'react';
import { HOLIDAYS_2026 } from '../constants';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
}

type ViewMode = 'calendar' | 'year' | 'month';

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, label, minDate, maxDate, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => value ? new Date(value) : new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const containerRef = useRef<HTMLDivElement>(null);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const monthNames = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  useEffect(() => {
    if (value) setViewDate(new Date(value));
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setViewMode('calendar');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const handleSelectDate = (day: number) => {
    const selected = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const offset = selected.getTimezoneOffset();
    const adjustedDate = new Date(selected.getTime() - (offset * 60 * 1000));
    const dateString = adjustedDate.toISOString().split('T')[0];
    onChange(dateString);
    setIsOpen(false);
    setViewMode('calendar');
  };

  const handleSelectYear = (year: number) => {
    setViewDate(new Date(year, viewDate.getMonth(), 1));
    setViewMode('calendar');
  };

  const handleSelectMonth = (month: number) => {
    setViewDate(new Date(viewDate.getFullYear(), month, 1));
    setViewMode('calendar');
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => currentYear - i);

  const renderDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const days = [];

    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-10" />);
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSelected = value === dateStr;
      const isToday = new Date().toISOString().split('T')[0] === dateStr;
      const isPast = minDate && dateStr < minDate;
      const isAfterMax = maxDate && dateStr > maxDate;
      // ใช้ local constructor เพื่อหลีกเลี่ยง timezone shift
      const dayOfWeek = new Date(year, month, d).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const holidayName = HOLIDAYS_2026[dateStr];
      const isHoliday = !!holidayName;
      const isDisabled = !!(isPast || isAfterMax || isWeekend || isHoliday);

      let cellClass = 'h-10 w-full flex items-center justify-center rounded-xl text-sm font-bold transition relative ';
      if (isSelected) {
        cellClass += 'bg-blue-600 text-white shadow-lg shadow-blue-200';
      } else if (isDisabled && (isPast || isAfterMax)) {
        cellClass += 'text-gray-200 cursor-not-allowed';
      } else if (isHoliday) {
        cellClass += 'bg-amber-50 text-amber-400 cursor-not-allowed border border-amber-200';
      } else if (isWeekend) {
        cellClass += 'text-rose-300 cursor-not-allowed';
      } else if (isToday) {
        cellClass += 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100';
      } else {
        cellClass += 'hover:bg-gray-100 text-gray-700';
      }

      days.push(
        <button
          key={d}
          type="button"
          disabled={isDisabled}
          onClick={() => !isDisabled && handleSelectDate(d)}
          title={holidayName ? `วันหยุด: ${holidayName}` : isWeekend ? 'วันหยุดสุดสัปดาห์' : undefined}
          className={cellClass}
        >
          {d}
          {isHoliday && !isSelected && (
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-400" />
          )}
        </button>
      );
    }
    return days;
  };

  const renderYearPicker = () => (
    <div className="max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">เลือกปี (พ.ศ.)</p>
      <div className="grid grid-cols-4 gap-1">
        {years.map((y) => {
          const christianYear = y + 543;
          const isSelected = viewDate.getFullYear() === y;
          return (
            <button
              key={y}
              type="button"
              onClick={() => handleSelectYear(y)}
              className={`py-2 rounded-xl text-xs font-bold transition ${isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
            >
              {christianYear}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderMonthPicker = () => (
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-center">เลือกเดือน</p>
      <div className="grid grid-cols-3 gap-1">
        {monthNames.map((name, i) => {
          const isSelected = viewDate.getMonth() === i;
          return (
            <button
              key={name}
              type="button"
              onClick={() => handleSelectMonth(i)}
              className={`py-3 rounded-xl text-xs font-bold transition ${isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderCalendar = () => (
    <>
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400 hover:text-blue-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode('month')}
            className="px-2 py-1 rounded-lg font-black text-gray-900 text-sm hover:bg-blue-50 transition"
            title="คลิกเพื่อเลือกเดือน"
          >
            {monthNames[viewDate.getMonth()]}
          </button>
          <span className="text-gray-400 font-bold"> </span>
          <button
            type="button"
            onClick={() => setViewMode('year')}
            className="px-2 py-1 rounded-lg font-black text-gray-900 text-sm hover:bg-blue-50 transition"
            title="คลิกเพื่อเลือกปี"
          >
            {viewDate.getFullYear() + 543}
          </button>
        </div>
        <button type="button" onClick={handleNextMonth} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400 hover:text-blue-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => (
          <div key={d} className="text-center text-[10px] font-black text-gray-300 uppercase py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {renderDays()}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-50 space-y-3">
        <div className="flex items-center justify-center gap-4 text-[9px] font-bold text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 inline-block" />วันหยุดบริษัท</span>
          <span className="flex items-center gap-1"><span className="text-rose-300 font-black">ส/อา</span>วันหยุดสุดสัปดาห์</span>
        </div>
        {(() => {
          const todayDate = new Date();
          const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;
          const todayDow = todayDate.getDay();
          const todayIsWeekend = todayDow === 0 || todayDow === 6;
          const todayIsHoliday = !!HOLIDAYS_2026[todayStr];
          const todayDisabled = todayIsWeekend || todayIsHoliday || (minDate && todayStr < minDate) || (maxDate && todayStr > maxDate);
          return (
            <div className="flex justify-center">
              <button
                type="button"
                disabled={!!todayDisabled}
                onClick={() => {
                  if (!todayDisabled) { onChange(todayStr); setIsOpen(false); }
                }}
                className={`text-[10px] font-black uppercase tracking-widest transition ${todayDisabled ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'}`}
              >
                วันนี้
              </button>
            </div>
          );
        })()}
      </div>
    </>
  );

  return (
    <div className="relative" ref={containerRef}>
      {label ? <label className="block text-[10px] font-black text-gray-400 uppercase mb-2 tracking-widest">{label}</label> : null}
      <div
        onClick={() => { setIsOpen(!isOpen); setViewMode('calendar'); }}
        className="w-full p-4 bg-white border-2 border-gray-200 rounded-2xl cursor-pointer flex items-center justify-between hover:border-blue-400 transition group"
      >
        <span className={`text-sm font-bold ${value ? 'text-gray-900' : 'text-gray-300'}`}>
          {value ? new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : (placeholder || 'เลือกวันที่')}
        </span>
        <svg className={`w-5 h-5 transition ${isOpen ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-72 bg-white rounded-3xl shadow-2xl border border-gray-100 p-5 animate-in fade-in slide-in-from-top-2 duration-200">
          {viewMode === 'year' && renderYearPicker()}
          {viewMode === 'month' && (
            <>
              {renderMonthPicker()}
              <button type="button" onClick={() => setViewMode('calendar')} className="mt-3 w-full text-[10px] font-black text-gray-500 hover:text-blue-600 uppercase">← กลับไปปฏิทิน</button>
            </>
          )}
          {viewMode === 'calendar' && (
            <>
              {renderCalendar()}
              <p className="text-[9px] text-gray-400 text-center mt-2">คลิกที่เดือนหรือปีเพื่อเลือกโดยตรง</p>
            </>
          )}
          {viewMode === 'year' && (
            <button type="button" onClick={() => setViewMode('calendar')} className="mt-3 w-full text-[10px] font-black text-gray-500 hover:text-blue-600 uppercase">← กลับไปปฏิทิน</button>
          )}
        </div>
      )}
    </div>
  );
};

export default DatePicker;
