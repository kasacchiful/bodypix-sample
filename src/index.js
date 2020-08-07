import "babel-polyfill";

export async function bindPage() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('main').style.display = 'inline-block';
}

bindPage();
