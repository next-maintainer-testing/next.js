import { Button, Form, Input } from 'antd';

export default function Home() {
  return (
    <main>
      <Form>
        <Form.Item label="Name">
          <Input defaultValue="Turbopack CSS extraction" />
        </Form.Item>
        <Button type="primary">Submit</Button>
      </Form>
    </main>
  );
}

export function getServerSideProps() {
  return { props: {} };
}
