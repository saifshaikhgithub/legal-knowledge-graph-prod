"""
Case knowledge graph.

A directed multigraph: several different relationships can exist between the same
two entities ("A knows B", "A threatened B"), and each keeps its supporting evidence.
The case timeline is stored on the graph itself (graph.graph["timeline"]).
"""
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx

ENTITY_TYPES = ["Person", "Location", "Object", "Event", "Organization", "Vehicle", "Weapon", "Communication"]

TYPE_COLORS = {
    "Person": "#f43f5e",
    "Location": "#38bdf8",
    "Object": "#34d399",
    "Event": "#fbbf24",
    "Organization": "#a78bfa",
    "Vehicle": "#fb923c",
    "Weapon": "#ef4444",
    "Communication": "#2dd4bf",
    "Unknown": "#94a3b8",
}

# Honorifics and ranks that should not decide whether two names are the same person.
_NAME_NOISE = {"mr", "mrs", "ms", "miss", "dr", "prof", "sir", "officer", "det", "detective",
               "sgt", "sergeant", "inspector", "constable", "agent", "the"}


_VICTIM_ROLE = re.compile(r"(the\s+)?((murder|homicide|primary|deceased|alleged)\s+)?(victim|deceased)")


def _norm(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip().lower()


def _tokens(name: str) -> List[str]:
    return [t for t in re.split(r"[^a-z0-9]+", _norm(name)) if t and t not in _NAME_NOISE]


def _canonical_type(entity_type: Optional[str]) -> str:
    if not entity_type:
        return "Unknown"
    for t in ENTITY_TYPES:
        if t.lower() == str(entity_type).strip().lower():
            return t
    return "Unknown" if _norm(entity_type) in {"", "unknown", "other"} else str(entity_type).strip().title()


class CrimeGraph:
    def __init__(self):
        self.graph = nx.MultiDiGraph()
        self.graph.graph["timeline"] = []

    # ------------------------------------------------------------------ lookup

    def resolve(self, name: str, entity_type: Optional[str] = None) -> Optional[str]:
        """
        Find the existing node a mention refers to.
        1. exact match on name or a known alias (case-insensitive)
        2. token-subset match ("Chen" -> "Michael Chen"), only when it is unambiguous
           and the types are compatible. Ambiguous mentions never auto-merge -
           wrongly merging two suspects is worse than a duplicate node.
        """
        if not name:
            return None
        target = _norm(name)
        for node, data in self.graph.nodes(data=True):
            if _norm(node) == target or target in (_norm(a) for a in data.get("aliases", [])):
                return node

        query_tokens = set(_tokens(name))
        if not query_tokens:
            return None
        wanted_type = _canonical_type(entity_type)
        candidates = []
        for node, data in self.graph.nodes(data=True):
            node_type = data.get("type", "Unknown")
            if wanted_type != "Unknown" and node_type != "Unknown" and node_type != wanted_type:
                continue
            node_tokens = set(_tokens(node))
            if not node_tokens:
                continue
            if query_tokens <= node_tokens or node_tokens <= query_tokens:
                candidates.append(node)
        return candidates[0] if len(candidates) == 1 else None

    def get_all_entities(self) -> List[str]:
        return list(self.graph.nodes())

    # ----------------------------------------------------------------- updates

    def add_entity(self, name: str, entity_type: Optional[str] = None, attributes: Any = None,
                   aliases: Optional[List[str]] = None, description: Optional[str] = None) -> Tuple[Optional[str], bool]:
        """Insert or merge an entity. Returns (node_id, created)."""
        name = str(name or "").strip()
        if not name:
            return None, False

        if isinstance(attributes, list):
            attributes = {"traits": [str(a) for a in attributes]}
        elif attributes is not None and not isinstance(attributes, dict):
            attributes = {"info": str(attributes)}
        attributes = {str(k): v for k, v in (attributes or {}).items() if v not in (None, "", [], {})}
        entity_type = _canonical_type(entity_type)

        existing = self.resolve(name, entity_type)
        if existing:
            data = self.graph.nodes[existing]
            if data.get("type", "Unknown") == "Unknown" and entity_type != "Unknown":
                data["type"] = entity_type
            data["mentions"] = int(data.get("mentions", 1)) + 1
            known_aliases = data.setdefault("aliases", [])
            for alias in [name, *(aliases or [])]:
                if _norm(alias) != _norm(existing) and _norm(alias) not in map(_norm, known_aliases):
                    known_aliases.append(alias)
            if description and not data.get("description"):
                data["description"] = description
            attrs = data.setdefault("attributes", {})
            for key, value in attributes.items():
                current = attrs.get(key)
                if current in (None, "", []):
                    attrs[key] = value
                elif current != value:
                    merged = current if isinstance(current, list) else [current]
                    for v in value if isinstance(value, list) else [value]:
                        if v not in merged:
                            merged.append(v)
                    attrs[key] = merged
            return existing, False

        self.graph.add_node(
            name,
            label=name,
            type=entity_type,
            aliases=[a for a in (aliases or []) if _norm(a) != _norm(name)],
            description=description or "",
            attributes=attributes,
            mentions=1,
            first_seen=datetime.now(timezone.utc).isoformat(),
        )
        return name, True

    def add_relation(self, source: str, target: str, relation_type: Optional[str],
                     evidence: Optional[str] = None, confidence: Optional[float] = None,
                     time: Optional[str] = None) -> bool:
        """Add a directed relationship. Returns True if it is new."""
        if not source or not target:
            return False
        src = self.resolve(source) or self.add_entity(source, "Unknown")[0]
        dst = self.resolve(target) or self.add_entity(target, "Unknown")[0]
        if not src or not dst or src == dst:
            return False

        relation = re.sub(r"\s+", "_", _norm(relation_type) or "related_to")
        try:
            confidence = max(0.0, min(1.0, float(confidence))) if confidence is not None else None
        except (TypeError, ValueError):
            confidence = None

        if self.graph.has_edge(src, dst):
            for _, data in self.graph.get_edge_data(src, dst).items():
                if data.get("relation") == relation:
                    if evidence and evidence not in data.get("evidence", []):
                        data.setdefault("evidence", []).append(evidence)
                    if confidence is not None:
                        data["confidence"] = max(confidence, data.get("confidence") or 0)
                    if time and not data.get("time"):
                        data["time"] = time
                    return False

        self.graph.add_edge(
            src, dst,
            key=uuid.uuid4().hex[:10],
            relation=relation,
            evidence=[evidence] if evidence else [],
            confidence=confidence,
            time=time or "",
        )
        return True

    def add_timeline_event(self, time: str, description: str, entities: Optional[List[str]] = None,
                           sort_key: Optional[str] = None, source: Optional[str] = None) -> bool:
        if not description:
            return False
        timeline = self.graph.graph.setdefault("timeline", [])
        key = _norm(description)
        if any(_norm(e.get("description")) == key for e in timeline):
            return False
        timeline.append({
            "id": uuid.uuid4().hex[:10],
            "time": str(time or "Unknown time"),
            "sort_key": str(sort_key or ""),
            "description": description,
            "entities": [self.resolve(e) or e for e in (entities or [])],
            "source": source or "",
        })
        return True

    def apply_extraction(self, extraction: Dict[str, Any], source: Optional[str] = None) -> Dict[str, int]:
        """Merge an LLM extraction result. Returns counts of what actually changed."""
        stats = {"entities_added": 0, "entities_updated": 0, "relations_added": 0, "events_added": 0}
        if not isinstance(extraction, dict):
            return stats

        for entity in extraction.get("entities") or []:
            if not isinstance(entity, dict):
                continue
            _, created = self.add_entity(
                entity.get("name"), entity.get("type"), entity.get("attributes"),
                aliases=entity.get("aliases"), description=entity.get("description"),
            )
            if entity.get("name"):
                stats["entities_added" if created else "entities_updated"] += 1

        for rel in extraction.get("relations") or []:
            if not isinstance(rel, dict):
                continue
            if self.add_relation(
                rel.get("source"), rel.get("target"), rel.get("relation_type") or rel.get("type"),
                evidence=rel.get("evidence"), confidence=rel.get("confidence"), time=rel.get("time"),
            ):
                stats["relations_added"] += 1

        for event in extraction.get("timeline") or []:
            if not isinstance(event, dict):
                continue
            if self.add_timeline_event(
                event.get("time"), event.get("description"), event.get("entities"),
                sort_key=event.get("sort_key"), source=source,
            ):
                stats["events_added"] += 1
        return stats

    def merge_entities(self, keep: str, merge: str) -> bool:
        """Fold `merge` into `keep`: edges are re-pointed, aliases and attributes combined."""
        if keep == merge or keep not in self.graph or merge not in self.graph:
            return False
        kept, gone = self.graph.nodes[keep], self.graph.nodes[merge]
        aliases = kept.setdefault("aliases", [])
        for alias in [merge, *gone.get("aliases", [])]:
            if _norm(alias) != _norm(keep) and _norm(alias) not in map(_norm, aliases):
                aliases.append(alias)
        if kept.get("type", "Unknown") == "Unknown":
            kept["type"] = gone.get("type", "Unknown")
        if not kept.get("description"):
            kept["description"] = gone.get("description", "")
        for k, v in (gone.get("attributes") or {}).items():
            kept.setdefault("attributes", {}).setdefault(k, v)
        kept["mentions"] = int(kept.get("mentions", 1)) + int(gone.get("mentions", 1))

        for s, t, key, data in list(self.graph.edges(keys=True, data=True)):
            if merge not in (s, t):
                continue
            new_s, new_t = (keep if s == merge else s), (keep if t == merge else t)
            if new_s != new_t:
                self.graph.add_edge(new_s, new_t, key=key, **data)
        self.graph.remove_node(merge)
        for event in self.graph.graph.get("timeline", []):
            event["entities"] = [keep if e == merge else e for e in event.get("entities", [])]
        return True

    # ------------------------------------------------------------------ output

    def get_data_for_visualization(self) -> Tuple[List[Dict], List[Dict]]:
        nodes = []
        for node, data in self.graph.nodes(data=True):
            entity_type = data.get("type", "Unknown")
            nodes.append({
                "id": node,
                "label": data.get("label", node),
                "type": entity_type,
                "color": TYPE_COLORS.get(entity_type, TYPE_COLORS["Unknown"]),
                "description": data.get("description", ""),
                "aliases": data.get("aliases", []),
                "attributes": data.get("attributes", {}),
                "mentions": data.get("mentions", 1),
                "degree": self.graph.degree(node),
            })
        edges = []
        for source, target, key, data in self.graph.edges(keys=True, data=True):
            edges.append({
                "id": f"{key}",
                "source": source,
                "target": target,
                "label": data.get("relation", "related_to"),
                "evidence": data.get("evidence", []),
                "confidence": data.get("confidence"),
                "time": data.get("time", ""),
            })
        return nodes, edges

    def get_timeline(self) -> List[Dict]:
        timeline = list(self.graph.graph.get("timeline", []))
        # Events with a sortable ISO-ish key go in order; the rest keep insertion order after them.
        dated = sorted((e for e in timeline if e.get("sort_key")), key=lambda e: e["sort_key"])
        undated = [e for e in timeline if not e.get("sort_key")]
        return dated + undated

    def summary_for_llm(self, max_chars: int = 14000) -> str:
        """Compact text form of the case graph for prompts (far smaller than raw JSON)."""
        lines = ["ENTITIES:"]
        for node, data in sorted(self.graph.nodes(data=True), key=lambda x: -self.graph.degree(x[0])):
            bits = [f"- {node} [{data.get('type', 'Unknown')}]"]
            if data.get("aliases"):
                bits.append(f"aka {', '.join(data['aliases'][:4])}")
            if data.get("description"):
                bits.append(f"- {data['description']}")
            attrs = data.get("attributes") or {}
            if attrs:
                bits.append("; ".join(f"{k}: {v}" for k, v in list(attrs.items())[:6]))
            lines.append(" ".join(bits))
        lines.append("\nRELATIONSHIPS:")
        for s, t, data in self.graph.edges(data=True):
            line = f"- {s} -[{data.get('relation')}]-> {t}"
            if data.get("time"):
                line += f" @ {data['time']}"
            if data.get("evidence"):
                line += f' (evidence: "{data["evidence"][0][:140]}")'
            lines.append(line)
        timeline = self.get_timeline()
        if timeline:
            lines.append("\nTIMELINE:")
            for e in timeline:
                lines.append(f"- {e['time']}: {e['description']}")
        text = "\n".join(lines)
        return text if len(text) <= max_chars else text[:max_chars] + "\n...[graph truncated]"

    def victims(self) -> List[str]:
        """
        Entities whose own role is victim / deceased. Descriptions are deliberately ignored:
        "wife of the victim" mentions the word but describes someone else.
        """
        found = []
        for node, data in self.graph.nodes(data=True):
            role = (data.get("attributes") or {}).get("role", "")
            roles = role if isinstance(role, list) else [role]
            # Each role phrase must itself BE "victim" ("murder victim", "deceased"), not merely mention one.
            phrases = [p.strip() for r in roles for p in re.split(r"[/,;]|\band\b", str(r).lower())]
            if any(_VICTIM_ROLE.fullmatch(p) for p in phrases):
                found.append(node)
        return found

    def role_of(self, node: str) -> str:
        """Readable role text for an entity, e.g. "spouse, witness"."""
        role = (self.graph.nodes[node].get("attributes") or {}).get("role")
        parts: List[str] = []
        for r in role if isinstance(role, list) else [role]:
            for piece in re.split(r"[|/,;]", str(r or "")):
                piece = piece.strip()
                if piece and piece.lower() not in (x.lower() for x in parts):
                    parts.append(piece)
        return ", ".join(parts[:3])

    def person_roles(self) -> Dict[str, str]:
        """Role text for every person, keyed by name and by each alias."""
        roles: Dict[str, str] = {}
        for node, data in self.graph.nodes(data=True):
            if data.get("type") != "Person":
                continue
            role = self.role_of(node)
            if role:
                for key in [node, *data.get("aliases", [])]:
                    roles[str(key)] = role
        return roles

    def stats(self) -> Dict[str, Any]:
        by_type: Dict[str, int] = {}
        for _, data in self.graph.nodes(data=True):
            by_type[data.get("type", "Unknown")] = by_type.get(data.get("type", "Unknown"), 0) + 1
        return {
            "entities": self.graph.number_of_nodes(),
            "relations": self.graph.number_of_edges(),
            "events": len(self.graph.graph.get("timeline", [])),
            "by_type": by_type,
        }

    # --------------------------------------------------------- serialization

    def to_json(self) -> Dict[str, Any]:
        return nx.node_link_data(self.graph, edges="links")

    def from_json(self, data: Dict[str, Any]) -> None:
        edges_key = "links" if "links" in data else "edges"
        loaded = nx.node_link_graph(data, directed=data.get("directed", False),
                                    multigraph=data.get("multigraph", False), edges=edges_key)
        graph = nx.MultiDiGraph()
        graph.graph.update(loaded.graph)
        graph.graph.setdefault("timeline", [])
        for node, attrs in loaded.nodes(data=True):
            attrs.setdefault("label", node)
            attrs.setdefault("type", "Unknown")
            attrs.setdefault("aliases", [])
            attrs.setdefault("mentions", 1)
            if "attributes" not in attrs:
                # Legacy format kept extra attributes flat on the node.
                reserved = {"label", "type", "aliases", "mentions", "description", "first_seen"}
                attrs["attributes"] = {k: v for k, v in list(attrs.items()) if k not in reserved}
                for k in list(attrs["attributes"]):
                    attrs.pop(k, None)
            graph.add_node(node, **attrs)
        edge_iter = (loaded.edges(keys=True, data=True) if loaded.is_multigraph()
                     else ((s, t, None, d) for s, t, d in loaded.edges(data=True)))
        for s, t, key, attrs in edge_iter:
            attrs = dict(attrs)
            attrs.setdefault("evidence", [])
            if isinstance(attrs["evidence"], str):
                attrs["evidence"] = [attrs["evidence"]]
            edge_key = key if isinstance(key, str) else uuid.uuid4().hex[:10]
            graph.add_edge(s, t, key=edge_key, **attrs)
        self.graph = graph
