/**************************************
 * Global Variables
 **************************************/
let selectedNodes = new Set();
let groupBy = "type";

/**************************************
 * Load Data and Initialize
 **************************************/
d3.json("data/tgraph.json").then(graphData => {
    initializeApp(graphData);
});

/**************************************
 * Main Initialization Function
 **************************************/
function initializeApp(graphData) {
    // Compute group counts & color scale
    const { nodetypes, colorScale } = setupColorScale(graphData);

    // Create SVG, <g>, and set up zoom/pan
    const { width, height, svg, g } = setupSVG();

    // Create force simulation
    const simulation = setupSimulation(graphData, width, height);

    // Build the graph (links & nodes)
    const { link, node } = buildGraph(graphData, g, colorScale);

    // Set up the simulation tick
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
    });

    // Build the legend
    buildLegend(nodetypes, colorScale);

    // Set up the selection box (lasso selection)
    setupSelectionBox(graphData, svg, g);

    // Define local functions for selection & UI updates
    function setSelectedNodes(newSelection) {
        selectedNodes = newSelection;
        updateUI();
    }

    function updateUI() {
        updateLegend();
        updateGraph();
    }

    function updateLegend() {
        // Convert Set to an array for sorting
        const selectedArray = Array.from(selectedNodes);
        // Sort A-Z
        selectedArray.sort((a, b) => a.fullName.localeCompare(b.fullName));

        // Group selected nodes by grouping
        const nodesByType = d3.group(selectedArray, d => d[groupBy]);

        // Remove old selected nodes lists
        d3.selectAll(".selected-nodes").remove();

        // Append selected nodes under the correct grouping, outside of the legend item
        d3.selectAll(".legend-item").each(function (grouping) {
            const selectedForType = nodesByType.get(grouping) || [];
            if (selectedForType.length > 0) {
                d3.select(this).node().insertAdjacentHTML("afterend", `
                    <ul class="selected-nodes">
                        ${selectedForType.map(node => `<li>${node.fullName}</li>`).join('')}
                    </ul>
                `);
            }
        });
    }

    function updateGraph() {
        d3.select("svg.graph")
            .classed("hasSelections", selectedNodes.size > 0);

        // Apply CSS class to selected nodes
        node.classed("selected", d => selectedNodes.has(d));

        // Apply CSS class to links where either node is selected
        link.classed("selected", d => selectedNodes.has(d.source) || selectedNodes.has(d.target));
    }

    /**************************************
     * Now we can define the drag handlers
     * and attach them to the node
     **************************************/
    node.call(
        d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended)
    );

    function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    /**************************************
     * End of main function's sub-functions
     **************************************/

    // Expose these methods if you want them accessible outside:
    // window.setSelectedNodes = setSelectedNodes;
    // window.updateUI = updateUI;
}

/**************************************
 * Helper Functions
 **************************************/

// Setup color scale & compute group counts
function setupColorScale(graphData) {
    const groupCounts = d3.rollup(
        graphData.nodes,
        v => v.length,
        d => d[groupBy]
    );

    // Sort groups by size (ascending order: least → most)
    const nodetypes = [...groupCounts.keys()]
        .sort((a, b) => groupCounts.get(a) - groupCounts.get(b));

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)
        .domain(nodetypes);

    return { nodetypes, colorScale };
}

// Create SVG and <g>, set up zoom
function setupSVG() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Ensure <svg> has the class "graph" for styling
    const svg = d3.select("svg.graph")
        .attr("width", width)
        .attr("height", height)
        .call(
            d3.zoom().on("zoom", (event) => {
                g.attr("transform", event.transform);
            })
        );

    const g = svg.append("g");

    return { width, height, svg, g };
}

// Create force simulation
function setupSimulation(graphData, width, height) {
    return d3.forceSimulation(graphData.nodes)
        .force("link", d3.forceLink(graphData.edges).id(d => d.id))
        .force("charge", d3.forceManyBody().strength(-1000))
        .force("radial", d3.forceRadial(300, width / 2, height / 2));
}

// Build graph (links + nodes)
function buildGraph(graphData, g, colorScale) {
    const link = g.append("g")
        .selectAll("line")
        .data(graphData.edges)
        .join("line")
        .attr("class", "link")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-width", 2);

    const node = g.append("g")
        .selectAll("circle")
        .data(graphData.nodes)
        .join("circle")
        .attr("r", 10)
        .attr("class", "node")
        .attr("stroke-width", 0)
        .attr("stroke", d => colorScale(d[groupBy]))
        .attr("fill", d => colorScale(d[groupBy]));

    node.append("title").text(d => d.fullName);

    return { link, node };
}

// Build legend
function buildLegend(nodetypes, colorScale) {
    const legend = d3.select(".panel")
        .append("ul")
        .attr("class", "legend");

    legend.selectAll(".legend-item")
        .data(nodetypes)
        .enter()
        .append("li")
        .attr("class", "legend-item")
        .each(function (grouping) {
            const legendItem = d3.select(this);

            legendItem.append("svg")
                .attr("width", 20)
                .attr("height", 20)
                .append("circle")
                .attr("r", 10)
                .attr("cx", 10)
                .attr("cy", 10)
                .attr("fill", colorScale(grouping));

            legendItem.append("span")
                .attr("class", "legend-label")
                .text(grouping);

            legendItem.on("mouseenter", () => {
                legendItem.classed("state--snowflake", true);
            });

            legendItem.on("mouseleave", () => {
                legendItem.classed("state--snowflake", false);
            });

            // Add an empty <ul> for selected nodes under each grouping
            legendItem.append("ul")
                .attr("class", "selected-nodes");
        });
}

// Setup selection box (lasso selection)
function setupSelectionBox(graphData, svg, g) {
    let selectionBox = svg.append("rect")
        .attr("fill", "rgba(0,0,255,0.1)")
        .attr("stroke", "blue")
        .attr("stroke-dasharray", "4")
        .style("visibility", "hidden");

    let startX, startY;

    // Mousedown
    svg.on("mousedown", (event) => {
        const [x, y] = d3.pointer(event);
        startX = x;
        startY = y;

        selectionBox
            .attr("x", x)
            .attr("y", y)
            .attr("width", 0)
            .attr("height", 0)
            .style("visibility", "visible");
    });

    // Mousemove
    svg.on("mousemove", (event) => {
        if (startX === undefined) return;

        const [x, y] = d3.pointer(event);
        selectionBox
            .attr("x", Math.min(startX, x))
            .attr("y", Math.min(startY, y))
            .attr("width", Math.abs(x - startX))
            .attr("height", Math.abs(y - startY));
    });

    // Mouseup
    svg.on("mouseup", (event) => {
        if (startX === undefined) return;

        const [endX, endY] = d3.pointer(event);
        const transform = d3.zoomTransform(svg.node());

        // Convert selection box coordinates based on transform
        const x1 = (Math.min(startX, endX) - transform.x) / transform.k;
        const y1 = (Math.min(startY, endY) - transform.y) / transform.k;
        const x2 = (Math.max(startX, endX) - transform.x) / transform.k;
        const y2 = (Math.max(startY, endY) - transform.y) / transform.k;

        // Gather nodes inside the box
        const newNodes = new Set();
        graphData.nodes.forEach(d => {
            const x = d.x;
            const y = d.y;
            if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
                newNodes.add(d);
            }
        });

        // We can call setSelectedNodes if we keep it accessible
        // For simplicity, let's call a local function we define here
        setSelectedNodes(newNodes);

        // Hide the selection box
        selectionBox.style("visibility", "hidden");
        startX = undefined;
    });

    // Because setSelectedNodes is defined inside `initializeApp`,
    // we define a local wrapper function here:
    function setSelectedNodes(newSelection) {
        selectedNodes = newSelection;
        updateUI();
    }

    function updateUI() {
        updateLegend();
        updateGraph();
    }

    function updateLegend() {
        const selectedArray = Array.from(selectedNodes).sort((a, b) => a.fullName.localeCompare(b.fullName));
        const nodesByType = d3.group(selectedArray, d => d[groupBy]);

        d3.selectAll(".selected-nodes").remove();

        d3.selectAll(".legend-item").each(function (grouping) {
            const selectedForType = nodesByType.get(grouping) || [];
            if (selectedForType.length > 0) {
                d3.select(this).node().insertAdjacentHTML("afterend", `
                    <ul class="selected-nodes">
                        ${selectedForType.map(node => `<li>${node.fullName}</li>`).join('')}
                    </ul>
                `);
            }
        });
    }

    function updateGraph() {
        d3.select("svg.graph").classed("hasSelections", selectedNodes.size > 0);
        d3.selectAll(".node").classed("selected", d => selectedNodes.has(d));
        d3.selectAll(".link").classed("selected", d => selectedNodes.has(d.source) || selectedNodes.has(d.target));
    }
}
