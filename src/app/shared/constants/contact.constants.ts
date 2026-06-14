export interface ContactEmail {
  label: string;
  address: string;
}

export interface SocialLink {
  label: string;
  href: string;
  icon: 'instagram' | 'youtube' | 'whatsapp' | 'linkedin';
}

export const ULEARN_PHONE_DISPLAY = '+91 814 378 1399';
export const ULEARN_PHONE_TEL = '+918143781399';
export const ULEARN_WHATSAPP_URL = 'https://wa.me/918143781399';

export const ULEARN_EMAILS: ContactEmail[] = [
  { label: 'HR', address: 'hr@ulearn-edu.in' },
  { label: 'Careers', address: 'careers@ulearn-edu.in' },
  { label: 'Support', address: 'support@ulearn-edu.in' }
];

export const ULEARN_SOCIALS: SocialLink[] = [
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/ulearn___official/?hl=en',
    icon: 'instagram'
  },
  {
    label: 'YouTube',
    href: 'https://www.youtube.com/@ULearnEdutech',
    icon: 'youtube'
  },
  {
    label: 'WhatsApp',
    href: ULEARN_WHATSAPP_URL,
    icon: 'whatsapp'
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/ulearnedu',
    icon: 'linkedin'
  }
];

export const ULEARN_LINKTREE = 'https://linktr.ee/Ulearn___';
