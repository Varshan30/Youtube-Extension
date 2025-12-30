// utilities
function normalizeText(s){
  if (!s) return '';
  return s.replace(/\s+/g,' ').trim().toLowerCase();
}

function matchesKeywordList(text, keywords, strictness){
  if (!text) return false;
  const t = normalizeText(text);
  for (const k of keywords){
    const kk = normalizeText(k);
    if (!kk) continue;
    if (strictness >= 8){
      const re = new RegExp('\\b' + kk.replace(/[-/\\^$*+?.()|[\\]{}]/g, '\\$&') + '\\b','i');
      if (re.test(t)) return true;
    } else if (strictness >=5){
      const parts = kk.split(' ');
      let all = true;
      for (const p of parts) if (!t.includes(p)) { all = false; break; }
      if (all) return true;
    } else {
      if (t.includes(kk)) return true;
    }
  }
  return false;
}

// export if module system; not necessary, included for reference
try{ window._ytm_utils = { normalizeText, matchesKeywordList }; }catch(e){}
