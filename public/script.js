
let socket; // Make socket globally accessible

document.addEventListener('DOMContentLoaded', function () {
    socket = io(); // Initialize socket connection

    fetchAndRenderRoutes();

    socket.on('customerMoved', function (data) {
        // Optimistically update the UI to reflect the customer move
        moveCustomerInUI(data.custId, data.newRt, data.newDay);
    });
    socket.on('customersSwapped', function ({ firstRtDay, secondRtDay }) {
        // Refresh the UI to show the swap. For simplicity, you might reload the page.
        console.log('Customers swapped successfully');
        location.reload(); // Not ideal for real applications but useful for immediate feedback.
    });


    socket.on('customersMoved', function ({ fromRt, fromDay, toRt, toDay }) {
        // Ideally, you would have a function to refresh or directly manipulate the UI
        // For simplicity, let's just log it here. You should replace this with actual UI logic.
        console.log(`Customers moved from RT ${fromRt}, Day ${fromDay} to RT ${toRt}, Day ${toDay}`);
        location.reload(); // Simple way to refresh the UI, but not recommended for production
    });

    socket.on('updateFailed', function (data) {
        alert(`Failed to move customer: ${data.custId}. ${data.message}`);
    });
});
function fetchAndRenderRoutes() {
    fetch('/aggregated-routes')
        .then(response => response.json())
        .then(aggregatedRoutes => {
            // Group routes by RT
            const routesByRT = aggregatedRoutes.reduce((acc, route) => {
                if (!acc[route.rt]) acc[route.rt] = [];
                acc[route.rt].push(route);
                return acc;
            }, {});

            const routeContainer = document.getElementById('route-container');
            routeContainer.innerHTML = '';

            // Iterate through each RT
            Object.keys(routesByRT).sort((a, b) => a - b).forEach(rt => {
                const sortedRoutes = routesByRT[rt].sort((a, b) => parseInt(a.day) - parseInt(b.day));

                // Create RT container
                const rtContainer = document.createElement('div');
                rtContainer.classList.add('rt-container');
                rtContainer.style.display = 'flex';
                rtContainer.style.flexWrap = 'wrap';
                rtContainer.style.justifyContent = 'center';
                rtContainer.style.marginBottom = '20px';
                routeContainer.appendChild(rtContainer);

                // Populate RT container with day containers
                for (let i = 0; i < 20; i++) {
                    const route = sortedRoutes.find(r => parseInt(r.day) === i + 1);
                    const dayContainer = createDayRouteContainer(rt, i + 1, route);
                    dayContainer.style.flex = '1 0 19%';
                    rtContainer.appendChild(dayContainer);
                }

                routeContainer.appendChild(rtContainer);
            });

            setupDraggableItems();
            setupDroppableContainers();
        });
}


// Implement createDayRouteContainer as before, ensuring it returns a dayContainer element.

function createDayRouteContainer(rt, day, routeData) {
    const container = document.createElement('div');
    container.classList.add('route-day', 'droppable');
    container.dataset.rt = rt;
    container.dataset.day = day;

    // Display RT/Day info
    const infoText = document.createElement('h2');
    infoText.textContent = `Route: ${rt}, Day: ${day}`;
    container.appendChild(infoText);

    // Append customers if routeData exists
    if (routeData && routeData.customers) {
        routeData.customers.forEach(customer => {
            const customerElement = createCustomerElement(customer);
            container.appendChild(customerElement);
        });
    }

    // Move and swap buttons
    const moveBtn = document.createElement('button');
    moveBtn.textContent = 'Move All';
    moveBtn.onclick = () => showMoveModal(rt, day);
    container.appendChild(moveBtn);

    const swapBtn = document.createElement('button');
    swapBtn.textContent = 'Swap All';
    swapBtn.onclick = () => showSwapModal(rt, day);
    container.appendChild(swapBtn);

    return container;
}

function createMoveAllButton(rt) {
    const button = document.createElement('button');
    button.textContent = 'Move All RT ' + rt;
    button.addEventListener('click', () => {
        const toRt = prompt("Enter target RT for moving all:");
        if (toRt) {
            // Implement the move logic here or emit a socket event
            console.log(`Move all from RT ${rt} to RT ${toRt}`);
            // Example: socket.emit('moveAll', { fromRt: rt, toRt: toRt });
        }
    });
    return button;
}

function createSwapAllButton(rt) {
    const button = document.createElement('button');
    button.textContent = 'Swap All RT ' + rt;
    button.addEventListener('click', () => {
        const swapRt = prompt("Enter RT to swap with:");
        if (swapRt) {
            // Implement the swap logic here or emit a socket event
            console.log(`Swap all between RT ${rt} and RT ${swapRt}`);
            // Example: socket.emit('swapAll', { rt1: rt, rt2: swapRt });
        }
    });
    return button;
}

function createCustomerElement(customer) {
    const element = document.createElement('div');
    element.classList.add('customer', 'draggable');
    element.dataset.custId = customer.cust;
    element.textContent = `${customer.cust_name}`;
    element.setAttribute('draggable', 'true');
    return element;
}

function setupDraggableItems() {
    const draggableItems = document.querySelectorAll('.draggable');
    draggableItems.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
    });
}


function showMoveModal(rt, day) {
    const toRt = prompt("Enter the target RT:");
    const toDay = prompt("Enter the target Day:");
    if (toRt && toDay) {
        socket.emit('moveDayCustomers', { fromRt: rt, fromDay: day, toRt, toDay });
    }
}

function showSwapModal(rt, day) {
    const firstRtDay = { rt, day };
    const secondRt = prompt("Enter the second RT for swap:");
    const secondDay = prompt("Enter the second Day for swap:");
    if (secondRt && secondDay) {
        const secondRtDay = { rt: secondRt, day: secondDay };
        socket.emit('swapDayCustomers', { firstRtDay, secondRtDay });
    }
}

function setupDroppableContainers() {
    const droppableContainers = document.querySelectorAll('.droppable');
    droppableContainers.forEach(container => {
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
        container.addEventListener('dragenter', e => e.target.classList.add('dragover'));
        container.addEventListener('dragleave', e => e.target.classList.remove('dragover'));
    });
}

function handleDragStart(event) {
    event.dataTransfer.setData('text/plain', event.target.dataset.custId);
    event.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(event) {
    // This function can be used to reset styles or perform clean-up tasks
}

function handleDragOver(event) {
    event.preventDefault(); // Necessary to allow for dropping
    event.dataTransfer.dropEffect = 'move'; // Visual indicator for drag operation
}

function handleDrop(event) {
    event.preventDefault(); // Prevent default to allow drop
    const custId = event.dataTransfer.getData('text/plain');
    let target = event.target;

    // Ensure dropping on the correct target, might need adjustment if structure changes
    while (!target.classList.contains('droppable')) {
        target = target.parentNode;
    }

    const newRt = target.dataset.rt;
    const newDay = target.dataset.day;

    console.log(`Dropping customer: ${custId} into RT: ${newRt} DAY: ${newDay}`);

    // Emitting the event for server to update DB
    socket.emit('moveCustomer', { custId, newRt, newDay });
    moveCustomerInUI(custId, newRt, newDay); // Optimistic UI update
}

function moveCustomerInUI(custId, newRt, newDay) {
    const customerElement = document.querySelector(`[data-cust-id='${custId}']`);
    const newRouteContainer = Array.from(document.querySelectorAll('.route-day'))
        .find(r => r.dataset.rt === newRt && r.dataset.day === newDay);

    if (customerElement && newRouteContainer) {
        newRouteContainer.appendChild(customerElement);
    } else {
        console.error(`Failed to move customer in UI: ${custId} to RT: ${newRt}, DAY: ${newDay}`);
    }
}

// Call this function to re-attach event listeners after dynamic content is loaded or modified
function setupDraggableItems() {
    const draggableItems = document.querySelectorAll('.draggable');
    draggableItems.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
    });
}

function setupDroppableContainers() {
    const droppableContainers = document.querySelectorAll('.droppable');
    droppableContainers.forEach(container => {
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
        container.addEventListener('dragenter', e => e.target.classList.add('dragover'));
        container.addEventListener('dragleave', e => e.target.classList.remove('dragover'));
    });
}


