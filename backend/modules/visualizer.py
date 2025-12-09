from streamlit_agraph import agraph, Node, Edge, Config

def get_agraph_config(nodes_data, edges_data):
    """
    Converts raw node/edge data into streamlit-agraph objects.
    """
    nodes = []
    edges = []
    
    for n in nodes_data:
        nodes.append(Node(
            id=n['id'],
            label=n['label'],
            size=25,
            color=n['color'],
            title=f"Type: {n['type']}" # Tooltip
        ))
        
    for e in edges_data:
        edges.append(Edge(
            source=e['source'],
            target=e['target'],
            label=e['label'],
            type="CURVE_SMOOTH"
        ))
        
    config = Config(
        width=800,
        height=600,
        directed=False,  # Using undirected graph to match nx.Graph
        physics=True, 
        hierarchical=False,
        nodeHighlightBehavior=True,
        highlightColor="#F7A7A6",
        collapsible=False
    )
    
    return nodes, edges, config
