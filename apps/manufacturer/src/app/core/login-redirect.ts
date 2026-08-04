import { environment } from '../../environments/environment';

/**
 * MANUFACTURER APP KA APNA LOGIN PAGE NAHI HAI.
 *
 * Pehle yahan ek alag login screen thi. Uska nateeja ye tha ki logout dabane
 * par aadmi is app ke login par pahunchta tha — jabki wo login kahin aur se
 * (vyaparsetu.anjaninex.com) hua tha. Do login page = aadmi ko samajh hi nahi
 * aata ki uska asli darwaza kaunsa hai, aur password bhoolne par wo galat
 * jagah "Forgot password" dhoondta hai.
 *
 * Ab Super Admin wala hi tareeka: login sabka EK jagah, aur andar jaate hi
 * aadmi apne hisse me pahunch jata hai.
 */
export const CENTRAL_LOGIN = 'https://vyaparsetu.anjaninex.com/login';

/**
 * Login page par bhejo. Kahan se aaye the wo bhi saath le jaate hain, taaki
 * login ke baad wapas usi screen par laut sakein.
 */
export function goToCentralLogin(): void {
  // Dev me (localhost:4300) bahar mat bhejo — wahan API bhi local hoti hai
  if (!environment.production) {
    location.href = '/login-dev';
    return;
  }
  location.replace(CENTRAL_LOGIN);
}
