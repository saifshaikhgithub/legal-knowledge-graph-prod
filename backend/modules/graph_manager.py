import networkx as nx
import json

class CrimeGraph:
    def __init__(self):
        self.graph = nx.Graph()

    def _normalize_name(self, name):
        """Normalize entity name for consistent matching (case-insensitive, strip whitespace)."""
        if name is None:
            return ""
        return str(name).strip().lower()

    def node_exists(self, name):
        """Check if a node with the given name already exists in the graph.
        Returns the actual node name if found, None otherwise.
        Handles case-insensitive and partial name matching."""
        if not name:  # Return None for empty/None names
            return None
        normalized_name = self._normalize_name(name)
        
        # First pass: exact match (case-insensitive)
        for node in self.graph.nodes():
            if self._normalize_name(node) == normalized_name:
                return node
        
        # Second pass: check if name is a partial match of existing node
        # e.g., "Michael" should match "Michael Chen"
        name_parts = normalized_name.split()
        for node in self.graph.nodes():
            node_normalized = self._normalize_name(node)
            node_parts = node_normalized.split()
            
            # Check if all parts of the query name exist in the node name
            if all(part in node_parts for part in name_parts):
                # Return the more complete name (longer one)
                if len(node_parts) >= len(name_parts):
                    return node
            
            # Check if all parts of the node name exist in query name
            # This handles "Michael Chen" matching when we query "Chen"
            if all(part in name_parts for part in node_parts):
                if len(name_parts) > len(node_parts):
                    # The query is more complete, we'll create it as new
                    # But if it's a single word matching multi-word, use existing
                    if len(name_parts) == 1 or len(node_parts) > 1:
                        return node
        
        return None

    def get_all_entities(self):
        """Returns a list of all entity names in the graph."""
        return list(self.graph.nodes())

    def add_entity(self, name, entity_type, attributes=None):
        """Adds a node to the graph, or updates it if it already exists."""
        if not name:  # Skip None or empty names
            return
            
        # Ensure attributes is a dictionary
        if attributes is None:
            attributes = {}
        elif isinstance(attributes, list):
            # If attributes is a list of strings, store as 'traits'
            attributes = {'traits': attributes}
        elif not isinstance(attributes, dict):
            # If it's some other non-dict type, wrap it
            attributes = {'info': str(attributes)}
        
        # Check if node already exists (case-insensitive match)
        existing_node = self.node_exists(name)
        
        if existing_node:
            # Node exists - merge/update attributes
            current_attrs = self.graph.nodes[existing_node]
            
            # Update type if it's more specific or first time set
            if entity_type and (not current_attrs.get('type') or current_attrs.get('type') == 'Unknown'):
                current_attrs['type'] = entity_type
            
            # Merge additional attributes
            for key, value in attributes.items():
                if key not in current_attrs or not current_attrs[key]:
                    current_attrs[key] = value
                elif isinstance(current_attrs[key], list):
                    # If attribute is a list, append unique values
                    if isinstance(value, list):
                        for v in value:
                            if v not in current_attrs[key]:
                                current_attrs[key].append(v)
                    elif value not in current_attrs[key]:
                        current_attrs[key].append(value)
                elif current_attrs[key] != value:
                    # If values differ, convert to list
                    if isinstance(value, list):
                        current_attrs[key] = [current_attrs[key]] + value
                    else:
                        current_attrs[key] = [current_attrs[key], value]
        else:
            # New node - add it
            attributes['type'] = entity_type
            attributes['label'] = name
            self.graph.add_node(name, **attributes)

    def add_relation(self, source, target, relation_type, attributes=None):
        """Adds an edge to the graph, ensuring entities exist with normalized names."""
        if attributes is None:
            attributes = {}
        attributes['relation'] = relation_type
        
        # Find actual node names (handling case variations)
        actual_source = self.node_exists(source)
        actual_target = self.node_exists(target)
        
        # If nodes don't exist, create them with Unknown type
        if not actual_source:
            self.add_entity(source, "Unknown")
            actual_source = source
        
        if not actual_target:
            self.add_entity(target, "Unknown")
            actual_target = target
        
        self.graph.add_edge(actual_source, actual_target, **attributes)

    def get_context_subgraph(self, query_entities=None, depth=1):
        """
        Returns a subgraph relevant to the query. 
        If query_entities is None, returns the whole graph.
        """
        if not query_entities:
            return self.graph
        
        nodes = set()
        for entity in query_entities:
            if entity in self.graph:
                nodes.add(entity)
                # Add neighbors up to depth
                # For simple depth 1:
                nodes.update(self.graph.neighbors(entity))
        
        return self.graph.subgraph(nodes)

    def get_data_for_visualization(self):
        """
        Returns nodes and edges formatted for streamlit-agraph or similar.
        """
        nodes = []
        edges = []
        
        for node, data in self.graph.nodes(data=True):
            nodes.append({
                "id": node,
                "label": data.get('label', node),
                "type": data.get('type', 'Unknown'),
                "color": self._get_color_by_type(data.get('type'))
            })
            
        for source, target, data in self.graph.edges(data=True):
            edges.append({
                "source": source,
                "target": target,
                "label": data.get('relation', 'related_to')
            })
            
        return nodes, edges

    def _get_color_by_type(self, entity_type):
        colors = {
            "Person": "#ff4b4b",
            "Location": "#4b4bff",
            "Object": "#4bff4b",
            "Event": "#ffff4b",
            "Organization": "#ff4bff"
        }
        return colors.get(entity_type, "#808080")

    def to_json(self):
        return nx.node_link_data(self.graph)

    def from_json(self, data):
        self.graph = nx.node_link_graph(data)
