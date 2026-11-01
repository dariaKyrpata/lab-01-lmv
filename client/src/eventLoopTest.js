export async function runEventLoopTest() {
  console.log("Task 1");

  // Test 1
  console.log("1: A");

  setTimeout(() => console.log("1: B"), 0);

  Promise.resolve().then(() => console.log("1: C"));

  console.log("1: D");

  // Test 2
  Promise.resolve().then(() => {
    console.log("2: A");

    setTimeout(() => console.log("2: B"), 0);
  });

  console.log("2: C");

  // Test 3
  async function example() {
    console.log("3: A");

    await Promise.resolve();

    console.log("3: B");
  }

  example();

  console.log("3: C");

  // Test 4
  requestAnimationFrame(() => {
    console.log("4: A");
  });

  Promise.resolve().then(() => {
    console.log("4: B");
  });

  console.log("4: C");

  // Test 5
  setTimeout(() => {
    console.log("5: A");

    Promise.resolve().then(() => console.log("5: B"));
  }, 0);

  Promise.resolve().then(() => {
    console.log("5: C");
  });

  console.log("5: D");
}
