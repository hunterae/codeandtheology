$(function() {
  $(".mobile-nav-button").click(function() {
    $("body").addClass("open");
    $("#mobile-menu").addClass("open");
  });
  $(".menu-item.close-item.close").click(function() {
    $("body").removeClass("open");
    $("#mobile-menu").removeClass("open");
  });
});
