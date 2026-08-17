// Fixed-date Thai public/bank holidays (same Gregorian date every year, per the Bank
// of Thailand calendar) — keyed "MM-DD". Deliberately excludes lunar/Buddhist-calendar
// holidays (Makha Bucha, Visakha Bucha, Asalha Bucha, etc.) and any date the government
// substitutes for a weekend, since those shift year to year and aren't knowable from a
// static table — those still need manual entry.
export const THAI_FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "วันขึ้นปีใหม่",
  "04-06": "วันจักรี",
  "04-13": "วันสงกรานต์",
  "04-14": "วันสงกรานต์",
  "04-15": "วันสงกรานต์",
  "05-01": "วันแรงงานแห่งชาติ",
  "05-04": "วันฉัตรมงคล",
  "06-03": "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี",
  "07-28": "วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว",
  "08-12": "วันแม่แห่งชาติ",
  "10-13": "วันคล้ายวันสวรรคตพระบาทสมเด็จพระบรมชนกาธิเบศร มหาภูมิพลอดุลยเดชมหาราช",
  "10-23": "วันปิยมหาราช",
  "12-05": "วันพ่อแห่งชาติ",
  "12-10": "วันรัฐธรรมนูญ",
  "12-31": "วันสิ้นปี",
};
