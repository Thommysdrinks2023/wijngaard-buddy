// Fase 7 Blok C — oenologische calculators op het partijdetail. Adviserend,
// nooit zelfboekend: elk resultaat wordt pas een kelderlogregel na de knop
// "Zet om in kelderlogregel" + confirm. De notitie bevat invoerwaarden en
// formule-versie zodat een dosering later herleidbaar is (zie
// docs/oenologie-formules.md).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, addDays } from "date-fns";
import { toast } from "sonner";
import {
  berekenChaptalisatie,
  berekenSo2Advies,
  berekenYanAdvies,
  berekenZuurcorrectie,
  GIST_N_KLASSEN,
  type GistKlasse,
} from "@/lib/oenologie";
import { createKelderlog } from "@/lib/kelder-data";
import { fetchRegelgevingInstellingen } from "@/lib/regelgeving-data";
import { useInvoerder } from "@/lib/use-invoerder";
import { Calculator } from "lucide-react";

interface Props {
  partijId: string;
  tankId: string | null;
  volumeL: number;
  laatstePh: number | null;
  laatsteSo2Vrij: number | null;
  laatsteOechsle: number | null;
  laatsteTotaalzuur: number | null;
}

const TABS = ["SO₂", "YAN", "Chaptalisatie", "Zuur"] as const;

const veld = "h-10 rounded-lg border border-input bg-background px-2 text-sm";

function LimietWaarschuwing({ overschrijdt, wat }: { overschrijdt: boolean | null; wat: string }) {
  if (overschrijdt === false) return null;
  return (
    <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
      {overschrijdt === null
        ? `⚠️ De wettelijke limiet voor ${wat} (zone A) is nog niet geverifieerd in Instellingen → regelgeving. Controleer de officiële bron vóór je doseert.`
        : `⚠️ Dit voorstel OVERSCHRIJDT de geverifieerde limiet voor ${wat} (zone A). Niet uitvoeren zonder de regels te checken.`}
    </p>
  );
}

export function CalculatorsSectie(props: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("SO₂");
  const [open, setOpen] = useState(false);
  const regelgevingQ = useQuery({
    queryKey: ["regelgeving", "calculators"],
    queryFn: fetchRegelgevingInstellingen,
  });
  const sleutel = (s: string) => (regelgevingQ.data ?? []).find((r) => r.sleutel === s);
  const limietGeverifieerd = (s: string) => {
    const r = sleutel(s);
    return r?.waarde != null && r.waarde > 0 && r.laatst_gecontroleerd ? r.waarde : null;
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-medium"
      >
        <Calculator className="h-4 w-4" /> Calculators (SO₂ · YAN · chaptalisatie · zuur)
      </button>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`h-9 rounded-lg border px-3 text-xs font-medium ${
              tab === t
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background"
            }`}
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto h-11 rounded-lg border border-border bg-background px-3 text-xs"
        >
          Sluiten
        </button>
      </div>
      {tab === "SO₂" && (
        <So2Calc {...props} defaultDoel={sleutel("so2_streef_moleculair_mg_l")?.waarde ?? 0.8} />
      )}
      {tab === "YAN" && <YanCalc {...props} />}
      {tab === "Chaptalisatie" && (
        <ChaptalisatieCalc {...props} limiet={limietGeverifieerd("verrijking_max_volpct_zone")} />
      )}
      {tab === "Zuur" && (
        <ZuurCalc
          {...props}
          limietAan={limietGeverifieerd("aanzuring_max_g_l")}
          limietOnt={limietGeverifieerd("ontzuring_max_g_l")}
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        Rekenhulp, geen labvervanging — doseren → mengen → na-meten. Formules:
        docs/oenologie-formules.md.
      </p>
    </section>
  );
}

function useVoorstel(partijId: string, tankId: string | null) {
  const qc = useQueryClient();
  const [invoerder] = useInvoerder();
  return useMutation({
    mutationFn: async (
      regels: {
        middel: string;
        hoeveelheid: number | null;
        eenheid: "g" | "kg" | null;
        notitie: string;
        datum?: string;
        actie?: "toevoeging" | "overig";
        /** Fase 13 Blok C: sluitregel voor taken, bijv. "analyse:so2_vrij". */
        taak_sluit_bij?: string;
      }[],
    ) => {
      for (const r of regels) {
        await createKelderlog({
          datum: r.datum ?? format(new Date(), "yyyy-MM-dd"),
          partij: partijId,
          tank: tankId,
          actie: r.actie ?? "toevoeging",
          middel: r.middel,
          hoeveelheid: r.hoeveelheid,
          eenheid: r.eenheid,
          notitie: r.notitie,
          ingevoerd_door: invoerder,
          taak_sluit_bij: r.taak_sluit_bij,
        });
      }
    },
    onSuccess: () => {
      toast.success("Vastgelegd in het kelderlog");
      qc.invalidateQueries({ queryKey: ["kelderlog"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Opslaan mislukt"),
  });
}

function So2Calc({
  partijId,
  tankId,
  volumeL,
  laatstePh,
  laatsteSo2Vrij,
  defaultDoel,
}: Props & { defaultDoel: number }) {
  const [ph, setPh] = useState(laatstePh?.toString() ?? "");
  const [vrij, setVrij] = useState(laatsteSo2Vrij?.toString() ?? "");
  const [doel, setDoel] = useState(defaultDoel.toString());
  const [volume, setVolume] = useState(volumeL > 0 ? volumeL.toString() : "");
  const [naMetingDagen, setNaMetingDagen] = useState("3");
  const voorstelM = useVoorstel(partijId, tankId);

  const p = Number(ph.replace(",", "."));
  const v = Number(vrij.replace(",", "."));
  const d = Number(doel.replace(",", "."));
  const vol = Number(volume.replace(",", "."));
  const geldig = p > 2.5 && p < 4.5 && v >= 0 && d > 0 && vol > 0;
  const advies = geldig ? berekenSo2Advies(v, p, vol, d) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          className={veld}
          style={{ width: 90 }}
          placeholder="pH"
          value={ph}
          onChange={(e) => setPh(e.target.value)}
          inputMode="decimal"
        />
        <input
          className={veld}
          style={{ width: 120 }}
          placeholder="vrij SO₂ mg/L"
          value={vrij}
          onChange={(e) => setVrij(e.target.value)}
          inputMode="decimal"
        />
        <input
          className={veld}
          style={{ width: 130 }}
          placeholder="doel mol. mg/L"
          value={doel}
          onChange={(e) => setDoel(e.target.value)}
          inputMode="decimal"
        />
        <input
          className={veld}
          style={{ width: 110 }}
          placeholder="volume L"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          inputMode="decimal"
        />
      </div>
      {advies && (
        <div className="space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
          <p>
            Moleculair SO₂ nu: <b>{advies.moleculairNu} mg/L</b> (doel {advies.doelMoleculair}).
            Benodigde vrije SO₂: <b>{advies.benodigdVrijMgL} mg/L</b> → verhoging{" "}
            <b>{advies.toeTeVoegenMgL} mg/L</b>.
          </p>
          <p>
            Dosering voor {vol} L: <b>{advies.gramKms} g KMS</b> ({advies.gramSo2} g zuivere SO₂).
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs">Na-meting over</label>
            <input
              className={veld}
              style={{ width: 60 }}
              value={naMetingDagen}
              onChange={(e) => setNaMetingDagen(e.target.value)}
              inputMode="numeric"
            />
            <span className="text-xs">dagen</span>
          </div>
          {advies.toeTeVoegenMgL > 0 && (
            <button
              type="button"
              disabled={voorstelM.isPending}
              onClick={() => {
                if (!confirm(`${advies.gramKms} g KMS vastleggen als toevoeging in het kelderlog?`))
                  return;
                const dagen = Math.max(1, Number(naMetingDagen) || 3);
                voorstelM.mutate([
                  {
                    middel: "sulfiet (KMS)",
                    hoeveelheid: advies.gramKms,
                    eenheid: "g",
                    notitie: `SO₂-calculator: pH ${p}, vrij ${v} mg/L, doel ${d} mg/L mol., volume ${vol} L → +${advies.toeTeVoegenMgL} mg/L vrij (formule ${advies.formuleVersie})`,
                  },
                  {
                    middel: "",
                    hoeveelheid: null,
                    eenheid: null,
                    actie: "overig",
                    datum: format(addDays(new Date(), dagen), "yyyy-MM-dd"),
                    notitie: `TAAK: na-meting SO₂ (gepland door SO₂-calculator op ${format(new Date(), "yyyy-MM-dd")})`,
                    // Fase 13 Blok C: deze taak sluit zichzelf zodra er voor
                    // deze partij een analyse is waarin vrij SO₂ écht gemeten
                    // is. Het werk dóén sluit de taak — niet het wegklikken.
                    taak_sluit_bij: "analyse:so2_vrij",
                  },
                ]);
              }}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Zet om in kelderlogregel + na-meting-taak
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function YanCalc({ partijId, tankId, volumeL, laatsteOechsle }: Props) {
  const [oe, setOe] = useState(laatsteOechsle?.toString() ?? "");
  const [klasse, setKlasse] = useState<GistKlasse>("middel");
  const [yan, setYan] = useState("");
  const [volume, setVolume] = useState(volumeL > 0 ? volumeL.toString() : "");
  const voorstelM = useVoorstel(partijId, tankId);

  const oeN = Number(oe.replace(",", "."));
  const volN = Number(volume.replace(",", "."));
  const advies =
    oeN > 30 && volN > 0
      ? berekenYanAdvies(oeN, klasse, volN, yan ? Number(yan.replace(",", ".")) : null)
      : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          className={veld}
          style={{ width: 90 }}
          placeholder="°Oe"
          value={oe}
          onChange={(e) => setOe(e.target.value)}
          inputMode="decimal"
        />
        <select
          className={veld}
          value={klasse}
          onChange={(e) => setKlasse(e.target.value as GistKlasse)}
        >
          {(Object.keys(GIST_N_KLASSEN) as GistKlasse[]).map((k) => (
            <option key={k} value={k}>
              gist: {k} ({GIST_N_KLASSEN[k]} mg N/L)
            </option>
          ))}
        </select>
        <input
          className={veld}
          style={{ width: 140 }}
          placeholder="gemeten YAN mg/L"
          value={yan}
          onChange={(e) => setYan(e.target.value)}
          inputMode="decimal"
        />
        <input
          className={veld}
          style={{ width: 110 }}
          placeholder="volume L"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          inputMode="decimal"
        />
      </div>
      {advies && (
        <div className="space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
          <p>
            Behoefte: <b>{advies.behoefteMgL} mg N/L</b>
            {advies.invoer.huidigeYanMgL != null && (
              <>
                {" "}
                · tekort: <b>{advies.tekortMgL} mg N/L</b>
              </>
            )}
          </p>
          <ul className="list-disc pl-5 text-xs">
            {advies.fasen.map((f) => (
              <li key={f.moment}>
                <b>{f.moment}</b>: {f.omschrijving}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={voorstelM.isPending}
            onClick={() => {
              if (!confirm("Voedingsschema als taken in het kelderlog zetten?")) return;
              voorstelM.mutate(
                advies.fasen.map((f) => ({
                  middel: "gistvoeding",
                  hoeveelheid: null,
                  eenheid: null,
                  actie: "overig" as const,
                  notitie: `TAAK: gistvoeding ${f.moment} — ${f.omschrijving} (YAN-calculator: ${oeN}°Oe, gist ${klasse}, behoefte ${advies.behoefteMgL} mg N/L, formule ${advies.formuleVersie})`,
                })),
              );
            }}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Zet schema om in kelderlog-taken
          </button>
        </div>
      )}
    </div>
  );
}

function ChaptalisatieCalc({
  partijId,
  tankId,
  volumeL,
  laatsteOechsle,
  limiet,
}: Props & { limiet: number | null }) {
  const [oe, setOe] = useState(laatsteOechsle?.toString() ?? "");
  const [doelAlc, setDoelAlc] = useState("");
  const [volume, setVolume] = useState(volumeL > 0 ? volumeL.toString() : "");
  const voorstelM = useVoorstel(partijId, tankId);

  const oeN = Number(oe.replace(",", "."));
  const doelN = Number(doelAlc.replace(",", "."));
  const volN = Number(volume.replace(",", "."));
  const advies =
    oeN > 30 && doelN > 0 && volN > 0 ? berekenChaptalisatie(oeN, doelN, volN, limiet) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          className={veld}
          style={{ width: 90 }}
          placeholder="°Oe"
          value={oe}
          onChange={(e) => setOe(e.target.value)}
          inputMode="decimal"
        />
        <input
          className={veld}
          style={{ width: 120 }}
          placeholder="doel vol%"
          value={doelAlc}
          onChange={(e) => setDoelAlc(e.target.value)}
          inputMode="decimal"
        />
        <input
          className={veld}
          style={{ width: 110 }}
          placeholder="volume L"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          inputMode="decimal"
        />
      </div>
      {advies && (
        <div className="space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
          <p>
            Potentieel nu: <b>{advies.potAlcNu} vol%</b> → verhoging{" "}
            <b>{advies.verhogingVolPct} vol%</b>.
          </p>
          <p>
            Suiker: <b>{advies.suikerGramPerL} g/L</b> = <b>{advies.suikerKgTotaal} kg</b> voor{" "}
            {volN} L.
          </p>
          <LimietWaarschuwing overschrijdt={advies.overschrijdtLimiet} wat="verrijking" />
          {advies.verhogingVolPct > 0 && (
            <button
              type="button"
              disabled={voorstelM.isPending}
              onClick={() => {
                if (!confirm(`${advies.suikerKgTotaal} kg suiker vastleggen als toevoeging?`))
                  return;
                voorstelM.mutate([
                  {
                    middel: "suiker (chaptalisatie)",
                    hoeveelheid: advies.suikerKgTotaal,
                    eenheid: "kg",
                    notitie: `Chaptalisatie-calculator: ${oeN}°Oe (${advies.potAlcNu} vol%) → ${doelN} vol% = +${advies.verhogingVolPct} vol%, ${advies.suikerGramPerL} g/L bij ${volN} L. Limiet zone A: ${advies.limietVolPct ?? "NIET GEVERIFIEERD"}${advies.overschrijdtLimiet ? " — OVERSCHREDEN" : ""} (formule ${advies.formuleVersie})`,
                  },
                ]);
              }}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Zet om in kelderlogregel
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ZuurCalc({
  partijId,
  tankId,
  volumeL,
  laatsteTotaalzuur,
  limietAan,
  limietOnt,
}: Props & { limietAan: number | null; limietOnt: number | null }) {
  const [huidig, setHuidig] = useState(laatsteTotaalzuur?.toString() ?? "");
  const [doel, setDoel] = useState("");
  const [volume, setVolume] = useState(volumeL > 0 ? volumeL.toString() : "");
  const voorstelM = useVoorstel(partijId, tankId);

  const hN = Number(huidig.replace(",", "."));
  const dN = Number(doel.replace(",", "."));
  const volN = Number(volume.replace(",", "."));
  const advies =
    hN > 0 && dN > 0 && volN > 0 ? berekenZuurcorrectie(hN, dN, volN, limietAan, limietOnt) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          className={veld}
          style={{ width: 140 }}
          placeholder="totaalzuur g/L nu"
          value={huidig}
          onChange={(e) => setHuidig(e.target.value)}
          inputMode="decimal"
        />
        <input
          className={veld}
          style={{ width: 120 }}
          placeholder="doel g/L"
          value={doel}
          onChange={(e) => setDoel(e.target.value)}
          inputMode="decimal"
        />
        <input
          className={veld}
          style={{ width: 110 }}
          placeholder="volume L"
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
          inputMode="decimal"
        />
      </div>
      {advies && advies.deltaGL !== 0 && (
        <div className="space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
          <p>
            <b>{advies.richting === "aanzuren" ? "Aanzuren" : "Ontzuren"}</b> met {advies.middel}:{" "}
            <b>{advies.gramPerL} g/L</b> = <b>{advies.kgTotaal} kg</b> voor {volN} L.
          </p>
          <LimietWaarschuwing overschrijdt={advies.overschrijdtLimiet} wat={advies.richting} />
          <button
            type="button"
            disabled={voorstelM.isPending}
            onClick={() => {
              if (!confirm(`${advies.kgTotaal} kg ${advies.middel} vastleggen als toevoeging?`))
                return;
              voorstelM.mutate([
                {
                  middel: advies.middel,
                  hoeveelheid: advies.kgTotaal,
                  eenheid: "kg",
                  notitie: `Zuurcorrectie-calculator: ${hN} → ${dN} g/L (${advies.richting} ${Math.abs(advies.deltaGL)} g/L) bij ${volN} L. Limiet zone A: ${advies.limietGL ?? "NIET GEVERIFIEERD"}${advies.overschrijdtLimiet ? " — OVERSCHREDEN" : ""} (formule ${advies.formuleVersie})`,
                },
              ]);
            }}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Zet om in kelderlogregel
          </button>
        </div>
      )}
    </div>
  );
}
