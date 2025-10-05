const radios = document.querySelectorAll('input[name="role"]');
const roleDetailBox = document.getElementById("role-detail-box");
radios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
        const val = e.target.value;
        if (radio.value === "officer" || radio.value === "employee") {
         roleDetailBox.style.display = "block";
        } else {roleDetailBox.style.display = "none";
        }
})
});
    