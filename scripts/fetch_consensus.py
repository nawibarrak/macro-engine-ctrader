"""Kumpulkan konsensus pasar (forecast) dari kalender mingguan -> data/consensus.csv (ditambah, tidak ditimpa).
Sumber tidak resmi dan hanya pekan berjalan, karena itu dijalankan tiap hari agar riwayat terkumpul."""
import os, re, json, requests, datetime as dt

URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
CSV = os.path.join(os.path.dirname(__file__), "..", "data", "consensus.csv")
# judul kalender (huruf kecil) -> id indikator
MAP = {"cpi m/m": "cpi", "core cpi m/m": "cpi_core", "core pce price index m/m": "pce_core", "ppi m/m": "ppi",
       "average hourly earnings m/m": "ahe", "non-farm employment change": "nfp", "unemployment rate": "unemp",
       "unemployment claims": "claims", "jolts job openings": "jolts", "retail sales m/m": "retail",
       "industrial production m/m": "ip", "prelim gdp q/q": "gdp", "advance gdp q/q": "gdp", "final gdp q/q": None,
       "empire state manufacturing index": "empire", "philly fed manufacturing index": "philly"}

def num(s):
    m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*([%KMB]?)\s*$", s or "")
    if not m: return None
    v = float(m.group(1)); u = m.group(2)
    return None if u == "B" else v        # K -> ribu, M -> juta (sesuai satuan web), % -> persen

def main():
    ev = requests.get(URL, timeout=40, headers={"User-Agent": "Mozilla/5.0"}).json()
    old = set(); lines = []
    if os.path.exists(CSV):
        lines = open(CSV).read().splitlines()
        for ln in lines:
            c = [x.strip() for x in ln.split(",")]
            if len(c) >= 3 and c[0][:2] == "20": old.add((c[0], c[1]))
    new = []
    for e in ev:
        if e.get("country") != "USD": continue
        ind = MAP.get((e.get("title") or "").strip().lower())
        v = num(e.get("forecast"))
        if not ind or v is None: continue
        day = e["date"][:10]                    # tanggal AS (zona ET) = tanggal rilis di FRED
        if (day, ind) not in old: new.append(f"{day},{ind},{v}"); old.add((day, ind))
    if not lines: lines = ["# tanggal_rilis,indikator,konsensus_pasar  (baris diawali # diabaikan; boleh isi manual)"]
    open(CSV, "w").write("\n".join(lines + new) + "\n")
    print(f"konsensus baru: {len(new)} baris; total {len(old)}")

if __name__ == "__main__":
    try: main()
    except Exception as ex: print(f"konsensus gagal (dilewati): {ex}")    # jangan gagalkan seluruh workflow
