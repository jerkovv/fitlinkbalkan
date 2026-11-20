// Mali PostgREST u memoriji: dovoljno za upite koje supabase-js salje iz dashboarda.
// Podrzava select sa ugnjezdenim relacijama, eq/neq/gt/gte/lt/lte/in/is/like/ilike/cs/not/or,
// order, limit/offset, Range, count=exact (Content-Range), HEAD i vnd.pgrst.object (single).

function podeliZarezom(s) {
  const delovi = [];
  let dubina = 0, tek = '';
  for (const c of s) {
    if (c === '(') dubina++;
    if (c === ')') dubina--;
    if (c === ',' && dubina === 0) { delovi.push(tek); tek = ''; continue; }
    tek += c;
  }
  if (tek) delovi.push(tek);
  return delovi.map((x) => x.trim()).filter(Boolean);
}

// "a,b,alias:tabela!hint(x,y),c" -> [{kolona} | {embed, alias, hint, inner, kolone}]
function parsirajSelect(s) {
  if (!s) return [{ kolona: '*' }];
  return podeliZarezom(s).map((deo) => {
    const z = deo.indexOf('(');
    if (z === -1) {
      let [levo, desno] = deo.split(':');
      if (desno === undefined) { desno = levo; levo = null; }
      desno = desno.split('::')[0];
      return { kolona: desno.replace(/->>?.*$/, ''), alias: levo };
    }
    const glava = deo.slice(0, z);
    const unutra = deo.slice(z + 1, deo.lastIndexOf(')'));
    let alias = null, ime = glava;
    if (glava.includes(':')) [alias, ime] = glava.split(':');
    let [tabela, ...hintovi] = ime.split('!');
    const inner = hintovi.includes('inner');
    const hint = hintovi.find((h) => h !== 'inner' && h !== 'left') || null;
    return { embed: tabela, alias, hint, inner, kolone: parsirajSelect(unutra) };
  });
}

function vrednost(v) {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function poredi(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  const na = Number(a), nb = Number(b);
  if (typeof a === 'number' || (a !== '' && b !== '' && !isNaN(na) && !isNaN(nb) && typeof a !== 'boolean')) {
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function jednako(a, b) {
  if (a === null || a === undefined) return b === null;
  if (typeof a === 'boolean') return String(a) === String(b);
  if (typeof a === 'number') return a === Number(b);
  return String(a) === String(b);
}

function listaIzZagrada(s) {
  // (a,b,"c d")
  const unutra = s.replace(/^\(/, '').replace(/\)$/, '');
  return podeliZarezom(unutra).map((x) => x.replace(/^"|"$/g, ''));
}

function uzmi(red, kolona) {
  // json putanje data->>x
  const m = kolona.match(/^([a-z_0-9]+)->>?(.+)$/);
  if (m) {
    const o = red[m[1]];
    return o == null ? null : o[m[2].replace(/'/g, '')];
  }
  return red[kolona];
}

function proveri(red, kolona, izraz) {
  let neg = false;
  if (izraz.startsWith('not.')) { neg = true; izraz = izraz.slice(4); }
  const tacka = izraz.indexOf('.');
  const op = izraz.slice(0, tacka);
  const arg = izraz.slice(tacka + 1);
  const v = uzmi(red, kolona);
  let ok;
  switch (op) {
    case 'eq': ok = jednako(v, vrednost(arg)); break;
    case 'neq': ok = !jednako(v, vrednost(arg)); break;
    case 'gt': ok = v != null && poredi(v, arg) > 0; break;
    case 'gte': ok = v != null && poredi(v, arg) >= 0; break;
    case 'lt': ok = v != null && poredi(v, arg) < 0; break;
    case 'lte': ok = v != null && poredi(v, arg) <= 0; break;
    case 'in': ok = listaIzZagrada(arg).some((x) => jednako(v, vrednost(x))); break;
    case 'is': ok = arg === 'null' ? v == null : String(v) === arg; break;
    case 'like':
    case 'ilike': {
      const re = new RegExp('^' + arg.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', op === 'ilike' ? 'i' : '');
      ok = v != null && re.test(String(v));
      break;
    }
    case 'cs': {
      const trazi = arg.startsWith('{') ? arg.slice(1, -1).split(',').filter(Boolean) : JSON.parse(arg);
      ok = Array.isArray(v) && trazi.every((x) => v.map(String).includes(String(x)));
      break;
    }
    case 'ov': {
      const trazi = arg.slice(1, -1).split(',');
      ok = Array.isArray(v) && trazi.some((x) => v.map(String).includes(String(x)));
      break;
    }
    case 'fts': case 'plfts': case 'wfts': ok = true; break;
    default: ok = true;
  }
  return neg ? !ok : ok;
}

// or=(a.eq.1,and(b.gt.2,c.lt.3))
function proveriLogiku(red, izraz, i) {
  const delovi = podeliZarezom(izraz.replace(/^\(/, '').replace(/\)$/, ''));
  const rez = delovi.map((d) => {
    const mm = d.match(/^(not\.)?(and|or)(\(.*\))$/);
    if (mm) {
      const r = proveriLogiku(red, mm[3], mm[2] === 'and');
      return mm[1] ? !r : r;
    }
    const t = d.indexOf('.');
    return proveri(red, d.slice(0, t), d.slice(t + 1));
  });
  return i ? rez.every(Boolean) : rez.some(Boolean);
}

class Baza {
  constructor(tabele, relacije) {
    this.tabele = tabele; // { ime: [redovi] }
    // relacije: [{ iz, kolona, u, ref = 'id', fk? }] (iz.kolona -> u.ref, mnogo-na-jedan)
    this.relacije = relacije;
  }

  nadjiRelaciju(roditelj, embed, hint) {
    const kandidati = [];
    for (const r of this.relacije) {
      if (r.iz === roditelj && r.u === embed) kandidati.push({ ...r, smer: 'gore' });
      if (r.u === roditelj && r.iz === embed) kandidati.push({ ...r, smer: 'dole' });
    }
    // embed moze biti i ime kolone (fk kolona bez _id)
    if (!kandidati.length) {
      for (const r of this.relacije) {
        if (r.iz === roditelj && (r.kolona === embed || r.kolona === embed + '_id')) kandidati.push({ ...r, smer: 'gore', embedJeKolona: true });
      }
    }
    if (!kandidati.length) return null;
    if (hint) {
      const h = kandidati.find((k) => (k.fk && k.fk === hint) || k.kolona === hint || hint.includes(k.kolona));
      if (h) return h;
    }
    return kandidati[0];
  }

  oblikuj(tabela, red, kolone) {
    const izlaz = {};
    for (const k of kolone) {
      if (k.kolona === '*') { Object.assign(izlaz, red); continue; }
      if (k.kolona) {
        izlaz[k.alias || k.kolona] = red[k.kolona] === undefined ? null : red[k.kolona];
        continue;
      }
      const rel = this.nadjiRelaciju(tabela, k.embed, k.hint);
      const kljuc = k.alias || k.embed;
      if (!rel) { izlaz[kljuc] = null; continue; }
      if (rel.smer === 'gore') {
        const cilj = (this.tabele[rel.u] || []).find((x) => jednako(x[rel.ref || 'id'], red[rel.kolona]));
        izlaz[kljuc] = cilj ? this.oblikuj(rel.u, cilj, k.kolone) : null;
      } else {
        const deca = (this.tabele[rel.iz] || []).filter((x) => jednako(x[rel.kolona], red[rel.ref || 'id']));
        izlaz[kljuc] = deca.map((d) => this.oblikuj(rel.iz, d, k.kolone));
      }
    }
    return izlaz;
  }

  upit(tabela, params, headers) {
    let redovi = (this.tabele[tabela] || []).slice();
    const select = parsirajSelect(params.get('select'));
    const embedFilteri = {};
    for (const [k, v] of params.entries()) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      if (k === 'or' || k === 'and' || k === 'not.or' || k === 'not.and') {
        const neg = k.startsWith('not.');
        redovi = redovi.filter((r) => { const x = proveriLogiku(r, v, k.endsWith('and')); return neg ? !x : x; });
        continue;
      }
      if (k.includes('.') && !k.includes('->')) {
        // filter po ugnjezdenoj relaciji: tabela.kolona=eq.x
        const [emb, kol] = k.split('.');
        (embedFilteri[emb] = embedFilteri[emb] || []).push([kol, v]);
        continue;
      }
      redovi = redovi.filter((r) => proveri(r, k, v));
    }
    // !inner + filteri po relaciji
    for (const s of select) {
      if (!s.embed) continue;
      const kljuc = s.alias || s.embed;
      const f = embedFilteri[kljuc] || embedFilteri[s.embed];
      if (!s.inner && !f) continue;
      const rel = this.nadjiRelaciju(tabela, s.embed, s.hint);
      if (!rel) continue;
      redovi = redovi.filter((r) => {
        let cilj;
        if (rel.smer === 'gore') {
          cilj = (this.tabele[rel.u] || []).filter((x) => jednako(x[rel.ref || 'id'], r[rel.kolona]));
        } else {
          cilj = (this.tabele[rel.iz] || []).filter((x) => jednako(x[rel.kolona], r[rel.ref || 'id']));
        }
        if (f) cilj = cilj.filter((c) => f.every(([kol, v]) => proveri(c, kol, v)));
        return s.inner ? cilj.length > 0 : true;
      });
    }
    const ukupno = redovi.length;
    const order = params.get('order');
    if (order) {
      const kljucevi = order.split(',').map((o) => {
        const [kol, ...mod] = o.split('.');
        return { kol, desc: mod.includes('desc'), nf: mod.includes('nullsfirst') };
      });
      redovi.sort((a, b) => {
        for (const { kol, desc, nf } of kljucevi) {
          const va = uzmi(a, kol), vb = uzmi(b, kol);
          if (va == null && vb != null) return nf ? -1 : desc ? -1 : 1;
          if (vb == null && va != null) return nf ? 1 : desc ? 1 : -1;
          const c = poredi(va, vb);
          if (c) return desc ? -c : c;
        }
        return 0;
      });
    }
    let od = Number(params.get('offset') || 0);
    let lim = params.get('limit') ? Number(params.get('limit')) : null;
    const range = headers['Range'] || headers['range'];
    if (range) {
      const m = range.match(/(\d+)-(\d+)/);
      if (m) { od = Number(m[1]); lim = Number(m[2]) - od + 1; }
    }
    redovi = redovi.slice(od, lim == null ? undefined : od + lim);
    const izlaz = redovi.map((r) => this.oblikuj(tabela, r, select));
    return { redovi: izlaz, ukupno, od };
  }
}

module.exports = { Baza, parsirajSelect };
