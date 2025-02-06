document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.querySelector("#menu-toggle"); // FIXED ID
    const navLinks = document.querySelector(".nav-links");

    if (menuToggle && navLinks) {
        menuToggle.addEventListener("click", () => {
            navLinks.classList.toggle("active");
        });
    }
});

