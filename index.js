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

    // Build the selection view on left panel
    buildSelectionPanel(nodetypes, colorScale);

    // Build the functionality tools on bottom panel
    buildFunctionPanel();

    // Set up the selection box (lasso selection)
    setupSelectionBox(graphData, svg, g);

    // Define local functions for selection & UI updates
    function setSelectedNodes(newSelection) {
        selectedNodes = newSelection;
        updateUI();
    }

    function updateUI() {
        updateSelectionPanel();
        updateGraph();
    }

    function updateSelectionPanel() {
        // Convert Set to an array for sorting
        const selectedArray = Array.from(selectedNodes);
        // Sort A-Z
        selectedArray.sort((a, b) => a.fullName.localeCompare(b.fullName));

        // Group selected nodes by grouping
        const nodesByType = d3.group(selectedArray, d => d[groupBy]);

        // Remove old selected nodes lists
        d3.selectAll(".selected-nodes").remove();

        // Append selected nodes under the correct grouping
        d3.selectAll(".selected-item").each(function (grouping) {
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
        link.classed("selected", d => selectedNodes.has(d.target));
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
    window.setSelectedNodes = setSelectedNodes;
    window.graphData = graphData;
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
        .force("radial", d3.forceRadial(300, width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(15));

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

    node.on("click", (event, d) => {
        // Toggle selection: remove if selected, add if not.
        if (selectedNodes.has(d)) {
            selectedNodes.delete(d);
        } else {
            selectedNodes.add(d);
        }
        window.setSelectedNodes(new Set(selectedNodes)); // Refresh view
    });

    // Create tooltip div
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("position", "absolute")
        .style("visibility", "hidden")
        .style("background", "#fff")
        .style("top", 0)
        .style("padding", "5px")
        .style("border", "1px solid #ccc");

    node.on("mouseover", (event, d) => {
        tooltip.html(`
            <table>
                <tr><td>Type:</td><td>${d.type}</td></tr>
                <tr><td>Full Name:</td><td>${d.fullName}</td></tr>
                <tr><td>File Name:</td><td>${d.fileName}</td></tr>
                <tr><td>Namespace Prefix:</td><td>${d.namespacePrefix}</td></tr>
                <tr><td>Manageable State:</td><td>${d.manageableState}</td></tr>
                <tr><td>Last Modified By:</td><td>${d.lastModifiedByName}</td></tr>
                <tr><td>Last Modified Date:</td><td>${d.lastModifiedDate}</td></tr>
                <tr><td>Created By:</td><td>${d.createdByName}</td></tr>
                <tr><td>Created Date:</td><td>${d.createdDate}</td></tr>
                <tr><td>ID:</td><td>${d.id}</td></tr>
            </table>
        `)
            .style("top", (event.pageY + 10) + "px")
            .style("left", (event.pageX + 10) + "px")
            .style("visibility", "visible");
    }).on("mouseout", () => {
        tooltip.style("visibility", "hidden");
    });


    return { link, node };
}

// Build Selection View
function buildSelectionPanel(nodetypes, colorScale) {
    const selectionPanelSelector = ".leftPanel .result"
    const selections = d3.select(selectionPanelSelector)
        .append("ul")
        .attr("class", "selection-list");

    selections.selectAll(".selected-item")
        .data(nodetypes)
        .enter()
        .append("li")
        .attr("class", "selected-item")
        .each(function (grouping) {
            const selectedItem = d3.select(this);

            selectedItem.append("svg")
                .attr("width", 20)
                .attr("height", 20)
                .append("circle")
                .attr("r", 10)
                .attr("cx", 10)
                .attr("cy", 10)
                .attr("fill", colorScale(grouping));

            selectedItem.append("span")
                .attr("class", "selections-label")
                .text(grouping);

            selectedItem.on("mouseenter", () => {
                selectedItem.classed("state--snowflake", true);
            });

            selectedItem.on("mouseleave", () => {
                selectedItem.classed("state--snowflake", false);
            });

            // Add an empty <ul> for selected nodes under each grouping
            selectedItem.append("ul")
                .attr("class", "selected-nodes");
        });
}

// Build Function View
function buildFunctionPanel() {
    // const functionPanelSelector = ".bottomPanel .parameters"
    // const parameters = d3.select(functionPanelSelector)
    //     .append()

    populateSearchAttributes();

    document.getElementById('regexSearchBox').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            const searchText = e.target.value.trim();
            if (!searchText) return;

            try {
                // Create a case-insensitive regex
                const regex = new RegExp(searchText, 'i');

                // Get selected attributes from the multi-select
                const select = document.getElementById('regexSearchFilter');
                const selectedAttributes = Array.from(select.selectedOptions).map(opt => opt.value);

                // Filter nodes: search only within the selected attributes.
                const matchedNodes = window.graphData.nodes.filter(node => {
                    return selectedAttributes.some(key => {
                        return typeof node[key] === 'string' && regex.test(node[key]);
                    });
                });

                // Update the selection view.
                window.setSelectedNodes(new Set(matchedNodes));
            } catch (error) {
                console.error('Error in regex:', error);
            }
        }
    });

    const dropdownMenu = document.querySelector('#regexSearchFilterDropdown .dropdown-menu');

    // Toggle dropdown visibility on button click.
    document.querySelector('#regexSearchFilterDropdown .dropdown-toggle').addEventListener('click', function (e) {
        dropdownMenu.classList.toggle('show');
    });

    dropdownMenu.addEventListener('click', function (e) {
        if (!e.target.matches('input[type="checkbox"]')) return;

        // If user is holding Ctrl (Windows/Linux) or Cmd (macOS)
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault(); // prevent default toggling

            const allCheckboxes = dropdownMenu.querySelectorAll('input[type="checkbox"]');
            const total = allCheckboxes.length;
            const checkedBoxes = Array.from(allCheckboxes).filter(cb => cb.checked);
            const isAllChecked = (checkedBoxes.length === total);
            const isNoneChecked = (checkedBoxes.length === 0);

            // Was the clicked checkbox already checked?
            const wasChecked = e.target.checked;

            if (wasChecked) {
                // Scenario: user Ctrl+clicked a checkbox that was checked
                if (isAllChecked) {
                    // If everything was selected, uncheck just this one
                    allCheckboxes.forEach(cb => cb.checked = true);
                    e.target.checked = false;
                } else {
                    // Otherwise, uncheck all and check only this one (original behavior)
                    allCheckboxes.forEach(cb => cb.checked = false);
                    e.target.checked = true;
                }
            } else {
                // Scenario: user Ctrl+clicked a checkbox that was not checked
                if (isNoneChecked) {
                    // If nothing was selected, select all except this one
                    allCheckboxes.forEach(cb => cb.checked = true);
                    e.target.checked = false;
                } else {
                    // Otherwise, uncheck all and check only this one (original behavior)
                    allCheckboxes.forEach(cb => cb.checked = false);
                    e.target.checked = true;
                }
            }
        }

        // Update the dropdown button text (your existing function)
        updateDropdownButtonText();
    });

    // Close the dropdown if clicking outside.
    document.addEventListener('click', function (e) {
        const dropdown = document.getElementById('regexSearchFilterDropdown');
        if (!dropdown.contains(e.target)) {
            document.querySelector('#regexSearchFilterDropdown .dropdown-menu').classList.remove('show');
        }
    });

    // Modify the search event to filter based on the selected attributes.
    document.getElementById('regexSearchBox').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            const searchText = e.target.value.trim();
            if (!searchText) return;

            try {
                const regex = new RegExp(searchText, 'i');

                // Get the values of all checked checkboxes.
                const checkboxes = document.querySelectorAll('#regexSearchFilterDropdown .dropdown-menu input[type="checkbox"]:checked');
                const selectedAttributes = Array.from(checkboxes).map(cb => cb.value);

                // Filter nodes by checking only the selected attributes.
                const matchedNodes = window.graphData.nodes.filter(node => {
                    return selectedAttributes.some(key => {
                        return typeof node[key] === 'string' && regex.test(node[key]);
                    });
                });

                window.setSelectedNodes(new Set(matchedNodes));
            } catch (error) {
                console.error('Error in regex:', error);
            }
        }
    });

    // Enable expansion feature
    document.getElementById('subtractExpansion').addEventListener('mouseup', function (e) {
        modifySelection(-1)
    })
    document.getElementById('addExpansion').addEventListener('mouseup', function (e) {
        modifySelection(1)
    })
}

function modifySelection(amount) {
    if (selectedNodes.size == 0) return;

    console.log('start');
    
    if (amount > 0) {
        let newSelection = selectedNodes;
        let newNodeIds = new Set();
        selectedNodes.forEach(node => {
            window.graphData.edges
                .filter(edge => edge.source.id == node.id || edge.target.id == node.id)
                .forEach(edge => {
                    newNodeIds.add(edge.target.id)
                    newNodeIds.add(edge.source.id)
                });
        })
            
        window.graphData.nodes
            .filter(node => newNodeIds.has(node.id))
            .forEach(node => newSelection.add(node));

        window.setSelectedNodes(newSelection);
    }

    console.log('stop');
    
}

// Call this once after your data loads.
function populateSearchAttributes() {
    const attributes = {
        "type": "Type",
        "fullName": "Full Name",
        "fileName": "File Name",
        "namespacePrefix": "Namespace Prefix",
        "manageableState": "Manageable State",
        "lastModifiedByName": "Last Modified By",
        "lastModifiedDate": "Last Modified Date",
        "createdByName": "Created By",
        "createdDate": "Created Date",
        "id": "ID",
    }

    const menu = document.querySelector('#regexSearchFilterDropdown .dropdown-menu');
    menu.innerHTML = '';

    for (const [key, value] of Object.entries(attributes)) {
        const label = document.createElement('label');
        label.classList.add('dropdown-option');
        label.innerHTML = `<input type="checkbox" value="${key}" checked> ${value}`;
        menu.appendChild(label);
    }

    updateDropdownButtonText(); // show "All" if all checked
}

// Update the dropdown button text based on selected options.
function updateDropdownButtonText() {
    const checkboxes = document.querySelectorAll('#regexSearchFilterDropdown .dropdown-menu input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    const dropdownButton = document.querySelector('#regexSearchFilterDropdown .dropdown-toggle');
    if (allChecked) {
        dropdownButton.textContent = 'All';
    } else {
        // List only a few selected items
        const selected = Array.from(checkboxes)
            .filter(cb => cb.checked);
        dropdownButton.textContent = `${selected.length} selected`;
    }
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

        window.setSelectedNodes(newNodes);

        // Hide the selection box
        selectionBox.style("visibility", "hidden");
        startX = undefined;
    });
}
