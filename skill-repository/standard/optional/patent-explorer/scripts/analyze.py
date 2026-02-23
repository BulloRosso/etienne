#!/usr/bin/env python3
"""
Patent Explorer — Analysis Pipeline

Reads patent documents, journal articles, and company profiles from an input
directory, performs clustering, keyword extraction, cross-linking, and outlier
detection, then writes analysis_results.json.

Usage:
    python analyze.py --input-dir /path/to/uploads --output analysis_results.json
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer, ENGLISH_STOP_WORDS
from sklearn.metrics import silhouette_score
from sklearn.metrics.pairwise import cosine_distances

# ---------------------------------------------------------------------------
# Simple suffix-based stemmer (avoids NLTK dependency)
# ---------------------------------------------------------------------------
SUFFIXES = [
    "ational", "tional", "enci", "anci", "izer", "ising", "izing",
    "ation", "ator", "ness", "ment", "ible", "able", "ful", "less",
    "ling", "ting", "ing", "ies", "ied", "ous", "ive", "ize",
    "ise", "ate", "ion", "ity", "ent", "ant", "ism", "ist",
    "ers", "ed", "ly", "er", "es", "al", "s",
]

STOP_WORDS = set(ENGLISH_STOP_WORDS) | {
    "use", "used", "uses", "using", "based", "method", "system", "device",
    "comprises", "comprising", "include", "includes", "including", "provide",
    "provides", "provided", "present", "invention", "disclosure", "embodiment",
    "fig", "figure", "claim", "claims", "according", "thereof", "wherein",
    "said", "having", "described", "example", "preferred", "various", "plurality",
}


def stem_token(word: str) -> str:
    if len(word) <= 4:
        return word
    for suffix in SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word

def clean_text(text: str) -> str:
    text = str(text).lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()

# ---------------------------------------------------------------------------
# File readers
# ---------------------------------------------------------------------------

def read_csv_file(path: str) -> list[dict]:
    rows = []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            sample = f.read(4096)
            f.seek(0)
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            except csv.Error:
                dialect = "excel"
            reader = csv.DictReader(f, dialect=dialect)
            for row in reader:
                rows.append({k.strip().lower(): v.strip() if v else "" for k, v in row.items() if k})
    except Exception as e:
        print(f"  [WARN] Could not parse CSV {path}: {e}", file=sys.stderr)
    return rows


def read_text_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        print(f"  [WARN] Could not read {path}: {e}", file=sys.stderr)
        return ""


def extract_pdf_text(path: str) -> str:
    for lib in ["pypdf", "PyPDF2"]:
        try:
            mod = __import__(lib)
            reader = mod.PdfReader(path)
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            if text.strip():
                return text
        except Exception:
            continue
    try:
        from pdfminer.high_level import extract_text as pm_extract
        text = pm_extract(path)
        if text.strip():
            return text
    except Exception:
        pass
    print(f"  [WARN] Could not extract text from PDF {path}. Install pypdf or pdfminer.six.", file=sys.stderr)
    return ""

# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------

PATENT_KEYWORDS = {"patent", "pat", "claim", "inventor", "assignee", "applicant", "filing", "granted", "patent_id", "patentid"}
ARTICLE_KEYWORDS = {"journal", "article", "abstract", "author", "publication", "doi", "volume", "issue", "article_id"}
COMPANY_KEYWORDS = {"company", "profile", "revenue", "employee", "industry", "founded", "headquarters"}


def guess_doc_type(columns: set[str], filename: str) -> str:
    fname = filename.lower()
    col_lower = {c.lower() for c in columns}
    if any(k in fname for k in ["patent", "pat"]):
        return "patent"
    if any(k in fname for k in ["article", "journal", "publication"]):
        return "article"
    if any(k in fname for k in ["company", "companies", "profile"]):
        return "company"
    scores = {
        "patent": len(col_lower & PATENT_KEYWORDS),
        "article": len(col_lower & ARTICLE_KEYWORDS),
        "company": len(col_lower & COMPANY_KEYWORDS),
    }
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "patent"


def find_column(row: dict, candidates: list[str], fallback: str = "") -> str:
    for c in candidates:
        for key in row:
            if c in key.lower():
                return str(row[key])
    return fallback


def ingest_directory(input_dir: str) -> pd.DataFrame:
    records = []
    seen_ids = set()
    counter = defaultdict(int)

    for fname in sorted(os.listdir(input_dir)):
        fpath = os.path.join(input_dir, fname)
        if not os.path.isfile(fpath):
            continue
        ext = Path(fname).suffix.lower()
        print(f"  Processing: {fname} ({ext})")

        if ext in (".csv", ".tsv", ".txt"):
            rows = read_csv_file(fpath)
            if not rows:
                text = read_text_file(fpath)
                if text.strip():
                    doc_id = Path(fname).stem
                    records.append({"id": doc_id, "type": "patent", "title": doc_id,
                                    "text": text, "company": "", "source_file": fname, "person": ""})
                continue

            columns = set(rows[0].keys())
            doc_type = guess_doc_type(columns, fname)
            print(f"    Detected type: {doc_type} (cols: {list(columns)[:8]})")

            for row in rows:
                doc_id = find_column(row, ["id", "patent_id", "patentid", "patent id",
                                           "article_id", "articleid", "doi", "number"], "")
                if not doc_id:
                    counter[doc_type] += 1
                    doc_id = f"{doc_type}_{counter[doc_type]:04d}"
                if doc_id in seen_ids:
                    continue
                seen_ids.add(doc_id)

                title = find_column(row, ["title", "name", "patent_title", "article_title"], doc_id)
                text = find_column(row, ["abstract", "description", "text", "summary", "content"], "")
                if not text:
                    text = title
                company = find_column(row, ["company", "assignee", "applicant", "organization", "affiliation"], "")
                person = find_column(row, ["person", "inventor", "author", "contact"], "")

                records.append({"id": doc_id, "type": doc_type, "title": title,
                                "text": f"{title} {text}", "company": company,
                                "source_file": fname, "person": person})

        elif ext == ".pdf":
            text = extract_pdf_text(fpath)
            if text.strip():
                doc_id = Path(fname).stem
                records.append({"id": doc_id, "type": "patent", "title": doc_id,
                                "text": text, "company": "", "source_file": fname, "person": ""})

        elif ext == ".json":
            try:
                with open(fpath) as f:
                    data = json.load(f)
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            doc_id = item.get("id", item.get("patent_id", ""))
                            if not doc_id:
                                counter["json"] += 1
                                doc_id = f"json_{counter['json']:04d}"
                            if doc_id in seen_ids:
                                continue
                            seen_ids.add(doc_id)
                            records.append({
                                "id": doc_id, "type": item.get("type", "patent"),
                                "title": item.get("title", doc_id),
                                "text": item.get("text", item.get("abstract", item.get("title", ""))),
                                "company": item.get("company", item.get("assignee", "")),
                                "source_file": fname,
                                "person": item.get("person", item.get("inventor", "")),
                            })
            except Exception as e:
                print(f"  [WARN] Could not parse JSON {fpath}: {e}", file=sys.stderr)

    if not records:
        print("[ERROR] No documents found.", file=sys.stderr)
        sys.exit(1)

    df = pd.DataFrame(records)
    df["text"] = df["text"].fillna("")
    df["company"] = df["company"].fillna("")
    df["person"] = df.get("person", pd.Series([""] * len(df))).fillna("")
    print(f"\n  Ingested {len(df)} documents: {dict(df['type'].value_counts())}")
    return df

# ---------------------------------------------------------------------------
# Clustering
# ---------------------------------------------------------------------------

def cluster_documents(df, min_k=3, max_k=5):
    vectorizer = TfidfVectorizer(
        max_features=5000, stop_words=list(STOP_WORDS),
        token_pattern=r"(?u)\b[a-zA-Z]{3,}\b", sublinear_tf=True,
    )
    tfidf = vectorizer.fit_transform(df["text"])
    n_docs = tfidf.shape[0]

    if n_docs < 4:
        best_k = min(2, n_docs)
        km = KMeans(n_clusters=best_k, random_state=42, n_init=10).fit(tfidf)
        return km.labels_, tfidf, vectorizer, km, best_k

    best_score, best_k, best_km = -1, min_k, None
    for k in range(min_k, min(max_k + 1, n_docs)):
        km = KMeans(n_clusters=k, random_state=42, n_init=10).fit(tfidf)
        score = silhouette_score(tfidf, km.labels_)
        print(f"    k={k}  silhouette={score:.4f}")
        if score > best_score:
            best_score, best_k, best_km = score, k, km

    print(f"    → Best k={best_k} (silhouette={best_score:.4f})")
    return best_km.labels_, tfidf, vectorizer, best_km, best_k


def describe_clusters(vectorizer, kmeans, df, labels):
    terms = vectorizer.get_feature_names_out()
    clusters = []
    for cid in range(kmeans.n_clusters):
        centroid = kmeans.cluster_centers_[cid]
        top_idx = centroid.argsort()[::-1][:10]
        top_terms = [terms[i] for i in top_idx]
        mask = labels == cid
        items_in = df.loc[mask, "id"].tolist()
        type_counts = df.loc[mask, "type"].value_counts().to_dict()
        label = " / ".join(top_terms[:3]).title()
        clusters.append({
            "id": int(cid), "label": label,
            "description": f"Top terms: {', '.join(top_terms)}",
            "item_count": int(mask.sum()), "items": items_in,
            "type_counts": type_counts, "top_terms": top_terms[:5],
        })
    clusters.sort(key=lambda c: c["item_count"], reverse=True)
    return clusters

# ---------------------------------------------------------------------------
# Keywords
# ---------------------------------------------------------------------------

def extract_keywords(vectorizer, tfidf_matrix, top_n=80):
    terms = vectorizer.get_feature_names_out()
    scores = np.asarray(tfidf_matrix.mean(axis=0)).flatten()
    top_idx = scores.argsort()[::-1]

    stem_map = {}
    for i in top_idx:
        surface = terms[i]
        st = stem_token(surface)
        if st in stem_map:
            stem_map[st] = (stem_map[st][0], stem_map[st][1] + scores[i])
        else:
            stem_map[st] = (surface, scores[i])

    keywords = sorted(stem_map.items(), key=lambda x: x[1][1], reverse=True)[:top_n]
    return [{"term": surface, "stem": stem, "frequency": round(float(score) * 1000, 2)}
            for stem, (surface, score) in keywords]

# ---------------------------------------------------------------------------
# Cross-linking
# ---------------------------------------------------------------------------

def build_links(df):
    patents = df[df["type"] == "patent"]
    articles = df[df["type"] == "article"]
    links = []
    if patents.empty or articles.empty:
        print("  [INFO] Not enough patents or articles for cross-linking.")
        return links

    patent_companies = {}
    for _, row in patents.iterrows():
        if row["company"]:
            patent_companies.setdefault(row["company"].lower().strip(), []).append(row["id"])

    for _, art in articles.iterrows():
        art_company = art.get("company", "")
        if art_company and art_company.lower().strip() in patent_companies:
            for pid in patent_companies[art_company.lower().strip()]:
                links.append({"patent_id": pid, "article_id": art["id"], "link_type": "company"})

    for _, art in articles.iterrows():
        art_text_lower = art["text"].lower()
        for _, pat in patents.iterrows():
            pat_id_lower = pat["id"].lower()
            if pat_id_lower and pat_id_lower in art_text_lower:
                links.append({"patent_id": pat["id"], "article_id": art["id"], "link_type": "patent_id"})

    seen, unique = set(), []
    for lnk in links:
        key = (lnk["patent_id"], lnk["article_id"])
        if key not in seen:
            seen.add(key)
            unique.append(lnk)
    print(f"  Found {len(unique)} cross-links.")
    return unique

# ---------------------------------------------------------------------------
# Outliers
# ---------------------------------------------------------------------------

def detect_outliers(df, tfidf_matrix, kmeans, vectorizer, labels, top_n=3):
    terms = vectorizer.get_feature_names_out()
    outliers = []
    for cid in range(kmeans.n_clusters):
        mask = labels == cid
        if mask.sum() < 2:
            continue
        centroid = kmeans.cluster_centers_[cid].reshape(1, -1)
        cluster_tfidf = tfidf_matrix[mask]
        dists = cosine_distances(cluster_tfidf, centroid).flatten()
        cluster_indices = np.where(mask)[0]

        c_top = centroid.flatten().argsort()[::-1][:3]
        cluster_label = " / ".join(terms[j] for j in c_top).title()

        for local_idx in dists.argsort()[::-1][:max(1, top_n)]:
            global_idx = cluster_indices[local_idx]
            row = df.iloc[global_idx]
            item_vec = tfidf_matrix[global_idx].toarray().flatten()
            diff = item_vec - centroid.flatten()
            top_diff_idx = np.abs(diff).argsort()[::-1][:8]
            distinctive_terms = [terms[i] for i in top_diff_idx if diff[i] > 0][:5]

            outliers.append({
                "id": row["id"], "title": row.get("title", row["id"]),
                "cluster_id": int(cid),
                "distance": round(float(dists[local_idx]), 4),
                "reason": f"Stands out in cluster '{cluster_label}' — "
                          f"emphasizes: {', '.join(distinctive_terms[:3]) if distinctive_terms else 'unique combination of terms'}",
                "distinctive_terms": distinctive_terms,
            })

    outliers.sort(key=lambda x: x["distance"], reverse=True)
    return outliers[:top_n]

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--output", default="analysis_results.json")
    args = parser.parse_args()

    print("=" * 60)
    print("Patent Explorer — Analysis Pipeline")
    print("=" * 60)

    print("\n[1/5] Ingesting documents...")
    df = ingest_directory(args.input_dir)

    print("\n[2/5] Clustering technologies...")
    labels, tfidf, vectorizer, kmeans, best_k = cluster_documents(df)
    df["cluster_id"] = labels
    clusters = describe_clusters(vectorizer, kmeans, df, labels)

    print("\n[3/5] Extracting keywords...")
    keywords = extract_keywords(vectorizer, tfidf)
    print(f"    Top keywords: {[k['term'] for k in keywords[:10]]}")

    print("\n[4/5] Cross-linking patents ↔ articles...")
    links = build_links(df)

    print("\n[5/5] Detecting outliers...")
    outliers = detect_outliers(df, tfidf, kmeans, vectorizer, labels, top_n=3)
    for o in outliers:
        print(f"    Outlier: {o['id']} (dist={o['distance']}) — {o['distinctive_terms'][:3]}")

    items = []
    for _, row in df.iterrows():
        items.append({
            "id": row["id"], "type": row["type"],
            "title": row.get("title", row["id"]),
            "company": row.get("company", ""),
            "person": row.get("person", ""),
            "cluster_id": int(row["cluster_id"]),
            "snippet": str(row["text"])[:200],
        })

    result = {"clusters": clusters, "keywords": keywords,
              "items": items, "links": links, "outliers": outliers}

    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\n✓ Results written to {args.output}")
    print(f"  {len(clusters)} clusters, {len(keywords)} keywords, "
          f"{len(links)} links, {len(outliers)} outliers, {len(items)} items")

if __name__ == "__main__":
    main()
