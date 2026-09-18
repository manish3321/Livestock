export const PROTOCOL_IDS = {
  DOUBLESYNCH: '00000000-0000-4000-8000-00000000d001',
  OVSYNCH: '00000000-0000-4000-8000-00000000d002',
  GPPG: '00000000-0000-4000-8000-00000000d003',
  CIDR_COSYNCH: '00000000-0000-4000-8000-00000000d004',
} as const;

export interface ProtocolStep {
  day: number;
  drug?: string;
  drugNp?: string;
  dose?: string;
  route?: string;
  action?: string;
  timing?: string;
}

export function isBuffaloLowSeason(monthIndex: number): boolean {
  return monthIndex === 3 || monthIndex === 4 || monthIndex === 5;
}

export function suggestProtocolCode(species: string, daysQuiet: number): 'DOUBLESYNCH' | 'OVSYNCH' | 'CIDR_COSYNCH' {
  if (daysQuiet > 60) return 'CIDR_COSYNCH';
  if (species === 'COW' && daysQuiet <= 30) return 'OVSYNCH';
  return 'DOUBLESYNCH';
}

export function protocolReason(code: string, daysQuiet: number): { reasonEn: string; reasonNp: string } {
  if (code === 'CIDR_COSYNCH') {
    return {
      reasonEn: `${daysQuiet} days quiet — likely true anestrus. PGF2α has no corpus luteum to act on; use a CIDR.`,
      reasonNp: `${daysQuiet} दिन शान्त — साँच्चिकै गर्मी नआएको हुनसक्छ। पी.जी.एफ.लाई कर्नस ल्युटियम चाहिन्छ; सिडर प्रयोग गर्नुहोस्।`,
    };
  }
  if (code === 'OVSYNCH') {
    return {
      reasonEn: `Cattle cycling (${daysQuiet} days). Ovsynch is the cattle default.`,
      reasonNp: `गाई चक्रमा छ (${daysQuiet} दिन)। ओभिसिंक गाईको मूल प्रोटोकल हो।`,
    };
  }
  if (daysQuiet > 30) {
    return {
      reasonEn: `${daysQuiet} days quiet. Doublesynch still, but watch her closely — she may be sliding toward anestrus.`,
      reasonNp: `${daysQuiet} दिन शान्त। डबलसिंक नै, तर नजिकबाट हेर्नुहोस् — अनास्ट्रसतिर गइरहेकी हुनसक्छिन्।`,
    };
  }
  return {
    reasonEn: `Cycling normally (${daysQuiet} days). Doublesynch is the buffalo default and roughly doubles conception versus Ovsynch.`,
    reasonNp: `सामान्य चक्र (${daysQuiet} दिन)। डबलसिंक भैंसीको मूल प्रोटोकल हो र ओभिसिंकभन्दा गर्भ रहने दर करिब दोब्बर।`,
  };
}

export function seasonalWarning(species: string, monthIndex: number): { en: string; np: string } | null {
  if (species !== 'BUFFALO' || !isBuffaloLowSeason(monthIndex)) return null;
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][monthIndex]!;
  return {
    en: `Starting in ${month}. Buffalo conception is about 40% now and about 48% after October. Consider waiting, or try a mineral mixture first.`,
    np: `${month} मा सुरु गर्दै। अहिले भैंसीको गर्भधारण करिब ४०% छ, कात्तिक पछि करिब ४८%। पर्खने वा पहिले खनिज मिश्रण दिने विचार गर्नुहोस्।`,
  };
}

export function injectionSteps(steps: ProtocolStep[]): ProtocolStep[] {
  return steps.filter((step) => step.action !== 'AI' && step.day != null);
}

export function aiStep(steps: ProtocolStep[]): ProtocolStep | undefined {
  return steps.find((step) => step.action === 'AI');
}
