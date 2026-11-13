// Demo provider: realistic sample lots, one per brand, so the catalogue can be
// designed and tested before a real data provider is connected.
// Every adapter returns lots in this same normalised shape (see sync-lots.mjs).

const H = 3600e3;

// [source, lot, year, make, model, trim, body, fuel, engineL, cyl, transmission, drive,
//  odometerMi, primaryDamage, secondaryDamage, title, condition, keys, city, state,
//  saleInHours, currentBid, buyNow, estRetail, color, image]
const ROWS = [
  ['copart', '71843562', 2019, 'Acura', 'RDX', 'Technology', 'suv', 'gasoline', 2.0, 4, 'automatic', 'awd', 41250, 'front_end', null, 'salvage', 'run_drive', true, 'Dallas', 'TX', 20, 9800, null, 27400, 'Сірий', 'acura-rdx'],
  ['iaai', '38821904', 2020, 'Audi', 'Q5', 'Premium Plus 45 TFSI', 'suv', 'gasoline', 2.0, 4, 'automatic', 'awd', 36410, 'side', 'front_end', 'salvage', 'run_drive', true, 'Atlanta', 'GA', 44, 12400, null, 33900, 'Чорний', 'audi-q5'],
  ['copart', '72018845', 2019, 'BMW', '3 Series', '330i', 'sedan', 'gasoline', 2.0, 4, 'automatic', 'rwd', 28960, 'front_end', null, 'salvage', 'run_drive', true, 'Miami', 'FL', 26, 11200, 15900, 29800, 'Білий', 'bmw-330i'],
  ['iaai', '39017722', 2021, 'Buick', 'Encore GX', 'Select', 'suv', 'gasoline', 1.3, 3, 'cvt', 'fwd', 22140, 'rear_end', null, 'salvage', 'run_drive', true, 'Columbus', 'OH', 68, 7600, 10500, 22300, 'Червоний', 'buick-encore-gx'],
  ['copart', '71559031', 2018, 'Cadillac', 'XT5', 'Luxury', 'suv', 'gasoline', 3.6, 6, 'automatic', 'awd', 58700, 'front_end', 'minor_dents', 'salvage', 'starts', true, 'Phoenix', 'AZ', 50, 8900, null, 26100, 'Сріблястий', 'cadillac-xt5'],
  ['copart', '72204417', 2019, 'Chevrolet', 'Malibu', 'LT', 'sedan', 'gasoline', 1.5, 4, 'cvt', 'fwd', 47320, 'front_end', null, 'salvage', 'run_drive', true, 'Houston', 'TX', 8, 4300, 6200, 15800, 'Синій', 'chevrolet-malibu'],
  ['iaai', '38655170', 2018, 'Chrysler', 'Pacifica', 'Touring L', 'minivan', 'gasoline', 3.6, 6, 'automatic', 'fwd', 63980, 'side', null, 'salvage', 'run_drive', true, 'Newark', 'NJ', 92, 6100, null, 19900, 'Білий', 'chrysler-pacifica'],
  ['copart', '71930266', 2019, 'Dodge', 'Charger', 'SXT', 'sedan', 'gasoline', 3.6, 6, 'automatic', 'rwd', 52410, 'front_end', 'all_over', 'salvage', 'stationary', false, 'Orlando', 'FL', 32, 5200, null, 21500, 'Чорний', 'dodge-charger'],
  ['iaai', '39102583', 2020, 'Ford', 'Escape', 'SE Hybrid', 'suv', 'hybrid', 2.5, 4, 'cvt', 'awd', 30870, 'front_end', null, 'salvage', 'run_drive', true, 'Chicago', 'IL', 56, 7900, 11900, 23700, 'Сірий', 'ford-escape'],
  ['copart', '72071139', 2019, 'GMC', 'Terrain', 'SLT', 'suv', 'diesel', 1.6, 4, 'automatic', 'awd', 44190, 'side', 'rear_end', 'salvage', 'run_drive', true, 'Denver', 'CO', 80, 7300, null, 21800, 'Бордовий', 'gmc-terrain'],
  ['iaai', '38977416', 2018, 'Honda', 'Accord', 'Sport 1.5T', 'sedan', 'gasoline', 1.5, 4, 'cvt', 'fwd', 49830, 'front_end', null, 'salvage', 'run_drive', true, 'Charlotte', 'NC', 14, 6800, 9400, 20900, 'Сріблястий', 'honda-accord'],
  ['copart', '72315508', 2021, 'Hyundai', 'Tucson', 'SEL', 'suv', 'gasoline', 2.0, 4, 'automatic', 'fwd', 26540, 'minor_dents', null, 'clean', 'run_drive', true, 'Nashville', 'TN', 38, 9900, 13800, 22600, 'Сірий', 'hyundai-tucson'],
  ['iaai', '38714059', 2017, 'Infiniti', 'Q50', '3.0t Luxe', 'sedan', 'gasoline', 3.0, 6, 'automatic', 'awd', 61280, 'front_end', null, 'salvage', 'starts', true, 'Baltimore', 'MD', 62, 5600, null, 19700, 'Білий', 'infiniti-q50'],
  ['copart', '71788620', 2020, 'KIA', 'Sportage', 'LX', 'suv', 'gasoline', 2.4, 4, 'automatic', 'fwd', 33970, 'front_end', null, 'salvage', 'run_drive', true, 'Las Vegas', 'NV', 74, 6400, 9200, 19400, 'Синій', 'kia-sportage'],
  ['iaai', '39066871', 2017, 'Lexus', 'RX', '350', 'suv', 'gasoline', 3.5, 6, 'automatic', 'awd', 68420, 'side', null, 'clean', 'run_drive', true, 'San Diego', 'CA', 24, 14800, 19900, 31800, 'Чорний', 'lexus-rx350'],
  ['copart', '72150972', 2020, 'Lincoln', 'Corsair', 'Reserve', 'suv', 'gasoline', 2.0, 4, 'automatic', 'awd', 29110, 'front_end', 'side', 'salvage', 'run_drive', true, 'Detroit', 'MI', 98, 10300, null, 30200, 'Сірий', 'lincoln-corsair'],
  ['iaai', '38890147', 2019, 'Mazda', 'CX-5', 'Grand Touring', 'suv', 'gasoline', 2.5, 4, 'automatic', 'awd', 38250, 'front_end', null, 'salvage', 'run_drive', true, 'Seattle', 'WA', 46, 8700, 12400, 23900, 'Червоний', 'mazda-cx5'],
  ['copart', '71995384', 2018, 'Mercedes-Benz', 'GLC', '300 4MATIC', 'suv', 'gasoline', 2.0, 4, 'automatic', 'awd', 54630, 'front_end', null, 'salvage', 'run_drive', true, 'Philadelphia', 'PA', 30, 11600, null, 28900, 'Чорний', 'mercedes-glc300'],
  ['iaai', '39150236', 2020, 'Nissan', 'Rogue', 'SV', 'suv', 'gasoline', 2.5, 4, 'cvt', 'awd', 35770, 'rear_end', null, 'salvage', 'run_drive', true, 'Kansas City', 'MO', 86, 6900, 9800, 20300, 'Білий', 'nissan-rogue'],
  ['copart', '72248813', 2019, 'RAM', '1500', 'Big Horn Crew Cab', 'pickup', 'gasoline', 5.7, 8, 'automatic', '4wd', 57390, 'front_end', null, 'salvage', 'run_drive', true, 'San Antonio', 'TX', 52, 14200, null, 34600, 'Сірий', 'ram-1500'],
  ['iaai', '38602758', 2019, 'Subaru', 'Outback', '2.5i Limited', 'wagon', 'gasoline', 2.5, 4, 'cvt', 'awd', 46810, 'minor_dents', null, 'clean', 'run_drive', true, 'Portland', 'OR', 110, 9100, 12900, 22400, 'Зелений', 'subaru-outback'],
  ['copart', '72389104', 2022, 'Tesla', 'Model Y', 'Long Range', 'suv', 'electric', null, null, 'automatic', 'awd', 24660, 'front_end', null, 'salvage', 'run_drive', true, 'Los Angeles', 'CA', 18, 16900, 22500, 38900, 'Білий', 'tesla-model-y'],
  ['iaai', '39208641', 2021, 'Toyota', 'Camry', 'SE', 'sedan', 'gasoline', 2.5, 4, 'automatic', 'fwd', 31940, 'front_end', null, 'salvage', 'run_drive', true, 'Tampa', 'FL', 40, 9600, 13500, 25200, 'Сріблястий', 'toyota-camry'],
  ['copart', '71866097', 2019, 'Volkswagen', 'Tiguan', 'SE 4Motion', 'suv', 'gasoline', 2.0, 4, 'automatic', 'awd', 43280, 'side', null, 'salvage', 'run_drive', true, 'Raleigh', 'NC', 64, 7100, null, 21100, 'Сірий', 'vw-tiguan'],
];

const lotUrl = (source, lot) => source === 'copart'
  ? `https://www.copart.com/lot/${lot}`
  : `https://www.iaai.com/VehicleDetail/${lot}~US`;

export async function fetchLots() {
  const now = Date.now();
  return ROWS.map(r => {
    const [source, lot, year, make, model, trim, body, fuel, engineL, cyl, transmission, drive,
      odometerMi, primaryDamage, secondaryDamage, title, condition, keys, city, state,
      saleInHours, currentBid, buyNow, estRetail, color, image] = r;
    return {
      source, lot, url: lotUrl(source, lot),
      vin: null, // real providers return the VIN; demo lots don't have one
      year, make, model, trim, body, fuel,
      engine_l: engineL, cylinders: cyl, transmission, drive,
      odometer_mi: odometerMi,
      primary_damage: primaryDamage, secondary_damage: secondaryDamage,
      title, condition, keys,
      location: { city, state },
      sale_date: new Date(now + saleInHours * H).toISOString(),
      current_bid_usd: currentBid, buy_now_usd: buyNow, est_retail_usd: estRetail,
      color, images: [`images/lots/${image}.jpg`],
    };
  });
}
