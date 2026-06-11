/**
 * All Indian states + Union Territories with major cities and state codes.
 * Used by party / branch / employee address forms.
 *
 * GST state codes: first 2 digits of GSTIN match this.
 */
export interface IndiaState {
  code: string;       // GST state code (2 digits)
  name: string;       // Display name
  cities: string[];   // Major cities (top 5-15 each)
}

export const INDIA_STATES: IndiaState[] = [
  { code: '01', name: 'Jammu & Kashmir', cities: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Udhampur'] },
  { code: '02', name: 'Himachal Pradesh', cities: ['Shimla', 'Mandi', 'Solan', 'Kullu', 'Dharamshala', 'Manali'] },
  { code: '03', name: 'Punjab', cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali'] },
  { code: '04', name: 'Chandigarh', cities: ['Chandigarh'] },
  { code: '05', name: 'Uttarakhand', cities: ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rishikesh', 'Nainital'] },
  { code: '06', name: 'Haryana', cities: ['Faridabad', 'Gurugram', 'Panipat', 'Ambala', 'Karnal', 'Hisar', 'Rohtak'] },
  { code: '07', name: 'Delhi', cities: ['New Delhi', 'Delhi'] },
  { code: '08', name: 'Rajasthan', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner', 'Alwar', 'Bhilwara', 'Sikar', 'Kankroli'] },
  { code: '09', name: 'Uttar Pradesh', cities: ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Noida', 'Allahabad', 'Bareilly', 'Aligarh'] },
  { code: '10', name: 'Bihar', cities: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia'] },
  { code: '11', name: 'Sikkim', cities: ['Gangtok', 'Namchi', 'Pelling'] },
  { code: '12', name: 'Arunachal Pradesh', cities: ['Itanagar', 'Naharlagun', 'Pasighat'] },
  { code: '13', name: 'Nagaland', cities: ['Kohima', 'Dimapur', 'Mokokchung'] },
  { code: '14', name: 'Manipur', cities: ['Imphal', 'Thoubal', 'Bishnupur'] },
  { code: '15', name: 'Mizoram', cities: ['Aizawl', 'Lunglei', 'Champhai'] },
  { code: '16', name: 'Tripura', cities: ['Agartala', 'Udaipur', 'Dharmanagar'] },
  { code: '17', name: 'Meghalaya', cities: ['Shillong', 'Tura', 'Jowai'] },
  { code: '18', name: 'Assam', cities: ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tezpur'] },
  { code: '19', name: 'West Bengal', cities: ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Bardhaman'] },
  { code: '20', name: 'Jharkhand', cities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Hazaribagh'] },
  { code: '21', name: 'Odisha', cities: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur'] },
  { code: '22', name: 'Chhattisgarh', cities: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg'] },
  { code: '23', name: 'Madhya Pradesh', cities: ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas'] },
  { code: '24', name: 'Gujarat', cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Anand'] },
  { code: '25', name: 'Daman & Diu', cities: ['Daman', 'Diu'] },
  { code: '26', name: 'Dadra & Nagar Haveli', cities: ['Silvassa'] },
  { code: '27', name: 'Maharashtra', cities: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad', 'Solapur', 'Kolhapur', 'Amravati'] },
  { code: '28', name: 'Andhra Pradesh', cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Tirupati'] },
  { code: '29', name: 'Karnataka', cities: ['Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi', 'Davanagere', 'Ballari'] },
  { code: '30', name: 'Goa', cities: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa'] },
  { code: '31', name: 'Lakshadweep', cities: ['Kavaratti'] },
  { code: '32', name: 'Kerala', cities: ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Palakkad'] },
  { code: '33', name: 'Tamil Nadu', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore'] },
  { code: '34', name: 'Puducherry', cities: ['Puducherry', 'Karaikal'] },
  { code: '35', name: 'Andaman & Nicobar', cities: ['Port Blair'] },
  { code: '36', name: 'Telangana', cities: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam'] },
  { code: '37', name: 'Andhra Pradesh (New)', cities: ['Amaravati', 'Visakhapatnam'] },
  { code: '38', name: 'Ladakh', cities: ['Leh', 'Kargil'] }
];

/** Find state by name (case-insensitive, partial match). */
export function findStateByName(name: string): IndiaState | undefined {
  if (!name) return undefined;
  const q = name.toLowerCase().trim();
  return INDIA_STATES.find(s =>
    s.name.toLowerCase() === q
    || s.name.toLowerCase().replace(/[^a-z]/g, '') === q.replace(/[^a-z]/g, '')
  );
}

/** Find state by GSTIN's first 2 digits. */
export function findStateByGstCode(gstin: string): IndiaState | undefined {
  if (!gstin || gstin.length < 2) return undefined;
  return INDIA_STATES.find(s => s.code === gstin.substring(0, 2));
}

/** Sorted list (alphabetical) for dropdowns. */
export const STATES_ALPHA = [...INDIA_STATES].sort((a, b) => a.name.localeCompare(b.name));

/** Pincode hint based on city (just first 3 digits — rough region). Used as placeholder, NOT validation. */
const CITY_PINCODE_HINTS: Record<string, string> = {
  'jaipur': '302001', 'jodhpur': '342001', 'udaipur': '313001', 'kota': '324001',
  'kankroli': '313324', 'ajmer': '305001', 'bikaner': '334001', 'alwar': '301001',
  'mumbai': '400001', 'pune': '411001', 'nagpur': '440001', 'nashik': '422001',
  'thane': '400601', 'aurangabad': '431001', 'solapur': '413001',
  'ahmedabad': '380001', 'surat': '395003', 'vadodara': '390001', 'rajkot': '360001',
  'gandhinagar': '382010', 'bhavnagar': '364001',
  'new delhi': '110001', 'delhi': '110001',
  'bengaluru': '560001', 'mysuru': '570001', 'mangaluru': '575001',
  'chennai': '600001', 'coimbatore': '641001', 'madurai': '625001',
  'kolkata': '700001', 'howrah': '711101',
  'hyderabad': '500001', 'warangal': '506002',
  'lucknow': '226001', 'kanpur': '208001', 'agra': '282001', 'noida': '201301',
  'bhopal': '462001', 'indore': '452001', 'gwalior': '474001',
  'patna': '800001', 'ranchi': '834001',
  'kochi': '682001', 'thiruvananthapuram': '695001',
  'guwahati': '781001',
  'chandigarh': '160001', 'gurugram': '122001', 'faridabad': '121001'
};

export function suggestPincode(city: string): string {
  if (!city) return '';
  return CITY_PINCODE_HINTS[city.toLowerCase().trim()] ?? '';
}
