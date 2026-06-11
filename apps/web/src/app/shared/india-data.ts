// =============================================================================
// INDIA MASTER DATA — States (GST code ke saath) + har state ki major cities.
// Branch / Party / Supplier forms me dropdowns ke liye shared file.
// =============================================================================

export interface IndianState {
  name: string;
  gstCode: string;   // 2-digit GST state code
  cities: string[];
}

export const INDIAN_STATES: IndianState[] = [
  { name: 'Andhra Pradesh', gstCode: '37', cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Tirupati', 'Kurnool', 'Rajahmundry', 'Kakinada', 'Anantapur', 'Kadapa'] },
  { name: 'Arunachal Pradesh', gstCode: '12', cities: ['Itanagar', 'Naharlagun', 'Pasighat', 'Tawang'] },
  { name: 'Assam', gstCode: '18', cities: ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tinsukia', 'Tezpur'] },
  { name: 'Bihar', gstCode: '10', cities: ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia', 'Arrah', 'Begusarai', 'Katihar', 'Chhapra'] },
  { name: 'Chhattisgarh', gstCode: '22', cities: ['Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg', 'Rajnandgaon', 'Raigarh', 'Jagdalpur'] },
  { name: 'Delhi', gstCode: '07', cities: ['New Delhi', 'Delhi', 'Dwarka', 'Rohini', 'Karol Bagh', 'Chandni Chowk', 'Lajpat Nagar', 'Pitampura', 'Janakpuri', 'Saket'] },
  { name: 'Goa', gstCode: '30', cities: ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda'] },
  { name: 'Gujarat', gstCode: '24', cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 'Anand', 'Navsari', 'Morbi', 'Vapi', 'Bharuch', 'Mehsana', 'Gandhidham'] },
  { name: 'Haryana', gstCode: '06', cities: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Hisar', 'Rohtak', 'Karnal', 'Sonipat', 'Yamunanagar', 'Panchkula', 'Bhiwani', 'Sirsa'] },
  { name: 'Himachal Pradesh', gstCode: '02', cities: ['Shimla', 'Solan', 'Dharamshala', 'Mandi', 'Baddi', 'Kullu', 'Hamirpur', 'Una'] },
  { name: 'Jammu & Kashmir', gstCode: '01', cities: ['Srinagar', 'Jammu', 'Anantnag', 'Baramulla', 'Udhampur', 'Kathua'] },
  { name: 'Jharkhand', gstCode: '20', cities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar', 'Hazaribagh', 'Giridih'] },
  { name: 'Karnataka', gstCode: '29', cities: ['Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi', 'Davanagere', 'Ballari', 'Tumakuru', 'Shivamogga', 'Udupi', 'Hosur'] },
  { name: 'Kerala', gstCode: '32', cities: ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Alappuzha', 'Palakkad', 'Malappuram'] },
  { name: 'Ladakh', gstCode: '38', cities: ['Leh', 'Kargil'] },
  { name: 'Madhya Pradesh', gstCode: '23', cities: ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Ratlam', 'Rewa', 'Katni', 'Chhindwara', 'Pithampur'] },
  { name: 'Maharashtra', gstCode: '27', cities: ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Solapur', 'Amravati', 'Kolhapur', 'Navi Mumbai', 'Sangli', 'Jalgaon', 'Akola', 'Latur', 'Ichalkaranji', 'Bhiwandi', 'Malegaon'] },
  { name: 'Manipur', gstCode: '14', cities: ['Imphal', 'Thoubal', 'Bishnupur'] },
  { name: 'Meghalaya', gstCode: '17', cities: ['Shillong', 'Tura', 'Jowai'] },
  { name: 'Mizoram', gstCode: '15', cities: ['Aizawl', 'Lunglei', 'Champhai'] },
  { name: 'Nagaland', gstCode: '13', cities: ['Kohima', 'Dimapur', 'Mokokchung'] },
  { name: 'Odisha', gstCode: '21', cities: ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri', 'Balasore'] },
  { name: 'Puducherry', gstCode: '34', cities: ['Puducherry', 'Karaikal', 'Yanam', 'Mahe'] },
  { name: 'Punjab', gstCode: '03', cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Hoshiarpur', 'Batala', 'Pathankot', 'Moga', 'Khanna'] },
  { name: 'Rajasthan', gstCode: '08', cities: ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner', 'Ajmer', 'Bhilwara', 'Alwar', 'Sikar', 'Sri Ganganagar', 'Pali', 'Balotra', 'Kishangarh', 'Beawar', 'Hanumangarh', 'Banswara', 'Chittorgarh', 'Jhunjhunu', 'Nagaur', 'Barmer'] },
  { name: 'Sikkim', gstCode: '11', cities: ['Gangtok', 'Namchi', 'Gyalshing'] },
  { name: 'Tamil Nadu', gstCode: '33', cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tiruppur', 'Erode', 'Vellore', 'Thoothukudi', 'Tirunelveli', 'Karur', 'Hosur', 'Kanchipuram'] },
  { name: 'Telangana', gstCode: '36', cities: ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam', 'Secunderabad', 'Mahbubnagar'] },
  { name: 'Tripura', gstCode: '16', cities: ['Agartala', 'Udaipur (Tripura)', 'Dharmanagar'] },
  { name: 'Uttar Pradesh', gstCode: '09', cities: ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Meerut', 'Prayagraj', 'Ghaziabad', 'Noida', 'Bareilly', 'Aligarh', 'Moradabad', 'Saharanpur', 'Gorakhpur', 'Firozabad', 'Jhansi', 'Mathura', 'Muzaffarnagar'] },
  { name: 'Uttarakhand', gstCode: '05', cities: ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Rudrapur', 'Kashipur', 'Rishikesh'] },
  { name: 'West Bengal', gstCode: '19', cities: ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Bardhaman', 'Malda', 'Kharagpur', 'Haldia'] },
  { name: 'Andaman & Nicobar', gstCode: '35', cities: ['Port Blair'] },
  { name: 'Chandigarh', gstCode: '04', cities: ['Chandigarh'] },
  { name: 'Dadra & Nagar Haveli and Daman & Diu', gstCode: '26', cities: ['Daman', 'Diu', 'Silvassa'] },
  { name: 'Lakshadweep', gstCode: '31', cities: ['Kavaratti'] }
];

/** State naam se GST code (pincode lookup ke baad map karne ke liye). */
export function gstCodeForState(stateName: string): string {
  const s = INDIAN_STATES.find(x => x.name.toLowerCase() === (stateName || '').toLowerCase().trim());
  return s?.gstCode ?? '';
}

/** India Post API ke state naam ko hamari list se match karo (spelling handle). */
export function matchIndiaState(apiState: string): string {
  const t = (apiState || '').toLowerCase().trim();
  if (!t) return '';
  const exact = INDIAN_STATES.find(s => s.name.toLowerCase() === t);
  if (exact) return exact.name;
  const partial = INDIAN_STATES.find(s => t.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(t));
  return partial?.name ?? apiState;
}

/** State ki cities (datalist suggestions ke liye). State khali ho to sab cities. */
export function citiesForState(stateName: string): string[] {
  const s = INDIAN_STATES.find(x => x.name === stateName);
  if (s) return s.cities;
  return INDIAN_STATES.flatMap(x => x.cities).sort();
}
