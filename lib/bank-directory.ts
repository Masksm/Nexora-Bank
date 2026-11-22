export type BankDirectoryEntry = {
  country: string;
  name: string;
  aliases?: string[];
};

export const bankDirectory: BankDirectoryEntry[] = [
  ...[
    "JPMorgan Chase Bank","Bank of America","Wells Fargo Bank","Citibank","U.S. Bank","PNC Bank","Capital One","Truist Bank","TD Bank","Fifth Third Bank","Regions Bank","Huntington National Bank","Citizens Bank","Ally Bank","Navy Federal Credit Union","USAA Federal Savings Bank","Discover Bank","SoFi Bank","Charles Schwab Bank","First Citizens Bank","KeyBank","M&T Bank","BMO Bank","Comerica Bank","Synchrony Bank"
  ].map(name=>({country:"US",name})),
  ...[
    "Barclays","HSBC UK","Lloyds Bank","NatWest","Santander UK","Nationwide Building Society","Halifax","TSB Bank","Monzo","Starling Bank","Metro Bank","Virgin Money","The Co-operative Bank","First Direct","Chase UK","Revolut"
  ].map(name=>({country:"GB",name})),
  ...[
    "Deutsche Bank","Commerzbank","Sparkasse","Volksbanken Raiffeisenbanken","ING Deutschland","DKB","N26","Comdirect","Postbank","TARGOBANK","Santander Germany","HypoVereinsbank","Consorsbank","bunq"
  ].map(name=>({country:"DE",name})),
  ...[
    "BNP Paribas","Crédit Agricole","Société Générale","Banque Populaire","Caisse d'Epargne","La Banque Postale","Boursobank","Crédit Mutuel","CIC","LCL","Hello bank!","Fortuneo","Revolut"
  ].map(name=>({country:"FR",name})),
  ...[
    "ING","Rabobank","ABN AMRO","bunq","SNS Bank","ASN Bank","Triodos Bank","De Volksbank","Knab","Revolut"
  ].map(name=>({country:"NL",name})),
  ...[
    "Banco Santander","BBVA","CaixaBank","Banco Sabadell","Bankinter","Unicaja Banco","ING España","Abanca","Kutxabank","Openbank","Revolut"
  ].map(name=>({country:"ES",name})),
  ...[
    "Allied Irish Banks (AIB)","Bank of Ireland","Permanent TSB","Ulster Bank","EBS","An Post Money","Revolut","N26"
  ].map(name=>({country:"IE",name})),
  ...[
    "Erste Bank","Raiffeisen Bank International","Bank Austria","BAWAG","easybank"
  ].map(name=>({country:"AT",name})),
  ...[
    "BNP Paribas Fortis","KBC Bank","Belfius","ING Belgium","Argenta"
  ].map(name=>({country:"BE",name})),
  ...[
    "UBS","Zürcher Kantonalbank","PostFinance","Raiffeisen Switzerland","Banque Cantonale Vaudoise"
  ].map(name=>({country:"CH",name})),
  ...[
    "Caixa Geral de Depósitos","Millennium BCP","Novo Banco","Santander Portugal","BPI","ActivoBank"
  ].map(name=>({country:"PT",name})),
  ...[
    "Intesa Sanpaolo","UniCredit","Banco BPM","BPER Banca","FinecoBank","Poste Italiane"
  ].map(name=>({country:"IT",name})),
  ...[
    "Swedbank","SEB","Handelsbanken","Nordea","Danske Bank","Länsförsäkringar Bank"
  ].map(name=>({country:"SE",name})),
  ...[
    "Nexora Bank"
  ].map(name=>({country:"NX",name})),
];

export function searchBanks(country: string, query: string, limit = 7) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return bankDirectory
    .filter(bank => bank.country === country)
    .filter(bank => bank.name.toLocaleLowerCase().includes(normalized) ||
      bank.aliases?.some(alias => alias.toLocaleLowerCase().includes(normalized)))
    .slice(0, limit);
}
